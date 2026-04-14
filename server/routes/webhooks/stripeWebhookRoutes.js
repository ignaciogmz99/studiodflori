/* global Buffer */
import { Router } from 'express'
import crypto from 'node:crypto'
import {
  buildWhatsAppTemplateParameters,
  sendWhatsAppBusinessMessage
} from '../../services/whatsappBusinessService.js'
import { upsertPaidOrder, getPaidOrderProcessingState, updatePaidOrderProcessingState } from '../../services/orderPersistenceService.js'
import { createStripeReceiptPdf } from '../../services/receiptPdfService.js'

const activeStripeEvents = new Set()

const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300

function parseStripeSignatureHeader(signatureHeader) {
  if (!signatureHeader) {
    return { timestamp: null, signatures: [] }
  }

  const parts = String(signatureHeader)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  let timestamp = null
  const signatures = []

  for (const part of parts) {
    const [key, value] = part.split('=')
    if (!key || !value) {
      continue
    }
    if (key === 't') {
      timestamp = Number(value)
      continue
    }
    if (key === 'v1') {
      signatures.push(value)
    }
  }

  return { timestamp, signatures }
}

function secureCompareHex(a, b) {
  const aBuffer = Buffer.from(String(a || ''), 'hex')
  const bBuffer = Buffer.from(String(b || ''), 'hex')
  if (aBuffer.length !== bBuffer.length) {
    return false
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

function verifyStripeSignature({ rawBody, signatureHeader, webhookSecret, toleranceSeconds = DEFAULT_WEBHOOK_TOLERANCE_SECONDS }) {
  if (!webhookSecret) {
    throw new Error('Falta STRIPE_WEBHOOK_SECRET para validar firma del webhook')
  }

  const { timestamp, signatures } = parseStripeSignatureHeader(signatureHeader)
  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new Error('Encabezado stripe-signature invalido')
  }

  const nowInSeconds = Math.floor(Date.now() / 1000)
  // Basic replay window check.
  if (Math.abs(nowInSeconds - timestamp) > toleranceSeconds) {
    throw new Error('Firma de Stripe expirada')
  }

  const payloadToSign = `${timestamp}.${rawBody.toString('utf8')}`
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payloadToSign, 'utf8')
    .digest('hex')

  const isValid = signatures.some((signature) => secureCompareHex(signature, expectedSignature))
  if (!isValid) {
    throw new Error('Firma de Stripe invalida')
  }
}

function formatAmount(amountInCents, currencyCode) {
  const amount = Number(amountInCents) / 100
  if (!Number.isFinite(amount)) {
    return '0.00'
  }
  return `${amount.toFixed(2)} ${String(currencyCode || 'mxn').toUpperCase()}`
}

function buildOrderEmailContent(paymentIntent) {
  const metadata = paymentIntent?.metadata || {}
  const fulfillmentType = String(metadata.fulfillment_type || 'delivery').toLowerCase() === 'pickup'
    ? 'Recoger en tienda'
    : 'Entrega a domicilio'

  const lines = [
    'Nuevo pago confirmado en Stripe',
    `PaymentIntent: ${paymentIntent?.id || ''}`,
    `Monto pagado: ${formatAmount(paymentIntent?.amount_received || paymentIntent?.amount, paymentIntent?.currency)}`,
    '',
    'Cliente:',
    `Nombre: ${metadata.customer_name || 'N/A'}`,
    `Telefono: ${metadata.customer_phone || 'N/A'}`,
    `Email: ${metadata.customer_email || paymentIntent?.receipt_email || 'N/A'}`,
    '',
    'Entrega:',
    `Tipo: ${fulfillmentType}`,
    `Fecha: ${metadata.delivery_date || 'N/A'}`,
    `Horario: ${metadata.delivery_time || 'N/A'}`
  ]

  if (!String(fulfillmentType).includes('Recoger')) {
    lines.push(`Ciudad: ${metadata.delivery_city || 'N/A'}`)
    lines.push(`Direccion: ${metadata.delivery_address || 'N/A'}`)
    lines.push(`Colonia: ${metadata.delivery_neighborhood || 'N/A'}`)
    lines.push(`CP: ${metadata.delivery_postal_code || 'N/A'}`)
  }

  lines.push(`Notas: ${metadata.delivery_notes || 'N/A'}`)
  lines.push('')
  lines.push(`Productos: ${metadata.cart_items_summary || 'N/A'}`)
  lines.push(`Cantidad de productos: ${metadata.cart_items_count || '0'}`)

  const text = lines.join('\n')
  const html = text
    .split('\n')
    .map((line) => `<div>${line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</div>`)
    .join('')

  return { text, html }
}

async function sendResendEmail({ resendApiKey, fromEmail, toEmail, subject, text, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject,
      text,
      html
    })
  })

  if (!response.ok) {
    const errorPayload = await response.text()
    throw new Error(`Resend rechazo el email: ${response.status} ${errorPayload}`)
  }
}

export function createStripeWebhookRouter({
  stripeWebhookSecret,
  resendApiKey,
  orderNotificationFromEmail,
  orderNotificationToEmail,
  whatsappAccessToken,
  whatsappPhoneNumberId,
  whatsappRecipient,
  whatsappTemplateName,
  whatsappTemplateLanguageCode,
  whatsappApiVersion
} = {}) {
  const router = Router()

  router.use((req, _res, next) => {
    // The route is mounted with express.raw; force Buffer to avoid signature mismatch.
    if (!Buffer.isBuffer(req.body)) {
      req.body = Buffer.from('')
    }
    next()
  })

  router.post('/', async (req, res) => {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('')
      const signatureHeader = req.headers['stripe-signature']

      verifyStripeSignature({
        rawBody,
        signatureHeader,
        webhookSecret: stripeWebhookSecret
      })

      const event = JSON.parse(rawBody.toString('utf8'))
      const eventType = String(event?.type || '').trim()
      const eventId = String(event?.id || '').trim()

      console.log('[Stripe webhook] recibido', { eventType, eventId })

      if (eventType === 'payment_intent.succeeded') {
        if (activeStripeEvents.has(eventId)) {
          console.log('[Stripe webhook] evento ya en proceso, omitiendo', { eventId })
          return res.status(200).json({ received: true, inProgress: true })
        }
        activeStripeEvents.add(eventId)

        // try/finally garantiza que el eventId siempre se libera del Set,
        // incluso si ocurre un error inesperado que escape los try/catch internos.
        try {
          const paymentIntent = event?.data?.object || {}
          const metadata = paymentIntent?.metadata || {}
          const paymentId = String(paymentIntent?.id || '').trim()
          const orderId = String(metadata.order_id || '').trim()
          const stageErrors = []

          // 1. Leer estado actual en DB ANTES del upsert — igual que MP.
          //    Permite early-exit sin escribir nada si el pago ya fue procesado completo.
          let existingState = await getPaidOrderProcessingState({ paymentId, orderId })

          if (existingState?.pdf_generated_at && existingState?.whatsapp_sent_at) {
            console.log('[Stripe webhook] pago ya procesado completamente, omitiendo duplicado', { paymentId })
            return res.status(200).json({ received: true, duplicated: true })
          }

          // 2. Persistir en Supabase — paso critico: si falla devolver 500 para que Stripe reintente.
          let persistenceSucceeded = false
          try {
            const amountMxn = Number(paymentIntent?.amount_received ?? paymentIntent?.amount ?? 0) / 100
            const persistenceResult = await upsertPaidOrder({
              amountMxn,
              customerName: String(metadata.customer_name || '').trim(),
              customerPhone: String(metadata.customer_phone || '').trim(),
              metadata: {
                order_id: orderId,
                customer_name: String(metadata.customer_name || '').trim(),
                customer_phone: String(metadata.customer_phone || '').trim(),
                cart_items_summary: String(metadata.cart_items_summary || '').trim(),
                delivery_city: String(metadata.delivery_city || '').trim(),
                delivery_address: String(metadata.delivery_address || '').trim(),
                delivery_neighborhood: String(metadata.delivery_neighborhood || '').trim(),
                delivery_postal_code: String(metadata.delivery_postal_code || '').trim(),
                delivery_date: String(metadata.delivery_date || '').trim(),
                delivery_time: String(metadata.delivery_time || '').trim()
              },
              paidAt: new Date().toISOString(),
              paymentId,
              orderId,
              source: 'stripe_webhook'
            })
            persistenceSucceeded = Boolean(persistenceResult?.persisted)
            existingState = persistenceResult?.row || existingState
            console.log('[Stripe webhook] comprobante en Supabase', { paymentId, duplicate: persistenceResult?.duplicate })
          } catch (error) {
            stageErrors.push(`persistencia: ${error?.message || error}`)
            console.warn('[Stripe webhook] fallo persistiendo comprobante:', error?.message || error)
          }

          if (!persistenceSucceeded) {
            return res.status(500).json({ error: `Fallo post-pago Stripe (${stageErrors.join(' | ')}), reintentando` })
          }

          // 3. Generar PDF server-side si no existe.
          if (!existingState?.pdf_generated_at) {
            try {
              const pdfResult = await createStripeReceiptPdf(paymentIntent)
              await updatePaidOrderProcessingState({
                paymentId,
                orderId,
                pdfPath: pdfResult.filePath,
                pdfGeneratedAt: new Date().toISOString()
              })
              console.log('[Stripe webhook] PDF generado', { paymentId, filePath: pdfResult.filePath })
            } catch (error) {
              stageErrors.push(`pdf: ${error?.message || error}`)
              console.warn('[Stripe webhook] fallo generando PDF:', error?.message || error)
            }
          }

          // 4. Re-leer estado desde DB antes de WhatsApp para detectar webhook concurrente — igual que MP.
          try {
            const freshState = await getPaidOrderProcessingState({ paymentId, orderId })
            if (freshState) existingState = freshState
          } catch { /* usar estado previo */ }

          // 5. Enviar WhatsApp si no se ha enviado.
          const whatsappTemplateParameters = buildWhatsAppTemplateParameters({
            orderId: metadata.order_id,
            paymentId: paymentIntent?.id,
            customerName: metadata.customer_name,
            recipientName: String(metadata.recipient_name || metadata.customer_name || '').trim(),
            cartItemsSummary: metadata.cart_items_summary,
            deliveryDate: metadata.delivery_date,
            deliveryTime: metadata.delivery_time,
            deliveryCity: metadata.delivery_city,
            deliveryAddress: metadata.delivery_address,
            deliveryNeighborhood: metadata.delivery_neighborhood,
            deliveryPostalCode: metadata.delivery_postal_code,
            customerPhone: metadata.customer_phone,
            flowerMessage: metadata.flower_message,
            specialInstructions: metadata.delivery_notes,
            deliveryType: metadata.fulfillment_type
          })
          const hasWhatsapp = Boolean(existingState?.whatsapp_sent_at)
          if (!hasWhatsapp) {
            try {
              const whatsappResult = await sendWhatsAppBusinessMessage({
                whatsappAccessToken,
                whatsappPhoneNumberId,
                whatsappRecipient,
                whatsappApiVersion,
                whatsappTemplateName,
                whatsappTemplateLanguageCode,
                whatsappTemplateParameters
              })
              await updatePaidOrderProcessingState({
                paymentId,
                orderId,
                whatsappSentAt: new Date().toISOString()
              })
              console.log('[Stripe webhook] WhatsApp enviado', {
                paymentId,
                recipient: whatsappResult?.recipient || 'unknown',
                messageId: whatsappResult?.responsePayload?.messages?.[0]?.id || 'unknown'
              })
            } catch (error) {
              stageErrors.push(`notificacion: ${error?.message || error}`)
              console.warn('[Stripe webhook] fallo enviando WhatsApp:', error?.message || error)
            }
          } else {
            console.log('[Stripe webhook] WhatsApp ya enviado previamente, omitiendo duplicado', { paymentId })
          }

          // 6. Email opcional via Resend (no critico, no bloquea el flujo).
          try {
            const recipient = String(orderNotificationToEmail || '').trim()
            const sender = String(orderNotificationFromEmail || '').trim()
            const apiKey = String(resendApiKey || '').trim()
            if (recipient && sender && apiKey) {
              const { text, html } = buildOrderEmailContent(paymentIntent)
              await sendResendEmail({
                resendApiKey: apiKey,
                fromEmail: sender,
                toEmail: recipient,
                subject: `Nuevo pedido pagado - ${paymentId || 'Stripe'}`,
                text,
                html
              })
              console.log('[Stripe webhook] email enviado', { recipient, paymentId })
            }
          } catch (error) {
            console.warn('[Stripe webhook] fallo enviando email (no critico):', error?.message || error)
          }

          if (stageErrors.length > 0) {
            console.warn('[Stripe webhook] post-pago parcial completado', { paymentId, errors: stageErrors })
            return res.status(200).json({ received: true, processedWithWarnings: true })
          }
        } finally {
          // Siempre liberar el eventId del Set, sin importar el resultado.
          activeStripeEvents.delete(eventId)
        }
      }

      return res.status(200).json({ received: true })
    } catch (error) {
      console.error('Error procesando webhook de Stripe:', error)
      return res.status(400).json({ error: error?.message || 'Error procesando webhook de Stripe' })
    }
  })

  return router
}
