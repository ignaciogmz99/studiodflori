/* global Buffer */
import { Router } from 'express'
import crypto from 'node:crypto'
import {
  buildWhatsAppTemplateParameters,
  buildWhatsAppReceiptMessage,
  sendWhatsAppBusinessMessage
} from '../../services/whatsappBusinessService.js'
import { upsertPaidOrder } from '../../services/orderPersistenceService.js'

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
        const paymentIntent = event?.data?.object || {}
        const metadata = paymentIntent?.metadata || {}

        // Persist the order to Supabase (source of truth for Stripe payments).
        try {
          const amountMxn = Number(paymentIntent?.amount_received ?? paymentIntent?.amount ?? 0) / 100
          await upsertPaidOrder({
            amountMxn,
            customerName: String(metadata.customer_name || '').trim(),
            customerPhone: String(metadata.customer_phone || '').trim(),
            metadata: {
              order_id: String(metadata.order_id || '').trim(),
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
            paymentId: String(paymentIntent?.id || '').trim(),
            orderId: String(metadata.order_id || '').trim(),
            source: 'stripe_webhook'
          })
          console.log('[Stripe webhook] comprobante guardado en Supabase', { paymentIntentId: paymentIntent?.id })
        } catch (error) {
          // Log but don't fail the webhook — Stripe would retry if we return non-2xx.
          console.warn('[Stripe webhook] fallo guardando comprobante en Supabase:', error?.message || error)
        }

        const { text, html } = buildOrderEmailContent(paymentIntent)
        const recipient = String(orderNotificationToEmail || '').trim()
        const sender = String(orderNotificationFromEmail || '').trim()
        const apiKey = String(resendApiKey || '').trim()

        if (recipient && sender && apiKey) {
          await sendResendEmail({
            resendApiKey: apiKey,
            fromEmail: sender,
            toEmail: recipient,
            subject: `Nuevo pedido pagado - ${paymentIntent?.id || 'Stripe'}`,
            text,
            html
          })
          console.log('[Stripe webhook] email enviado', { recipient, paymentIntentId: paymentIntent?.id })
        } else {
          console.warn('[Stripe webhook] faltan variables para envio de email (RESEND_API_KEY, ORDER_NOTIFICATION_FROM_EMAIL, ORDER_NOTIFICATION_TO_EMAIL)')
        }

        const whatsappText = buildWhatsAppReceiptMessage({
          provider: 'Stripe',
          paymentId: paymentIntent?.id,
          orderId: metadata.order_id,
          amountInMinor: paymentIntent?.amount_received || paymentIntent?.amount,
          currency: paymentIntent?.currency || 'MXN',
          customerName: metadata.customer_name,
          customerPhone: metadata.customer_phone,
          customerEmail: metadata.customer_email || paymentIntent?.receipt_email,
          deliveryType: String(metadata.fulfillment_type || 'delivery').toLowerCase() === 'pickup'
            ? 'Recoger en tienda'
            : 'Entrega a domicilio',
          deliveryDate: metadata.delivery_date,
          deliveryTime: metadata.delivery_time,
          deliveryCity: metadata.delivery_city
        })
        const whatsappTemplateParameters = buildWhatsAppTemplateParameters({
          orderId: metadata.order_id,
          paymentId: paymentIntent?.id,
          customerName: metadata.customer_name,
          recipientName: metadata.customer_name,
          cartItemsSummary: metadata.cart_items_summary,
          deliveryType: String(metadata.fulfillment_type || 'delivery').toLowerCase() === 'pickup'
            ? 'Recoger en tienda'
            : 'Entrega a domicilio',
          deliveryDate: metadata.delivery_date,
          deliveryTime: metadata.delivery_time,
          deliveryCity: metadata.delivery_city,
          deliveryAddress: metadata.delivery_address,
          deliveryNeighborhood: metadata.delivery_neighborhood,
          deliveryPostalCode: metadata.delivery_postal_code,
          customerPhone: metadata.customer_phone,
          flowerMessage: metadata.flower_message,
          specialInstructions: metadata.delivery_notes
        })

        try {
          const whatsappResult = await sendWhatsAppBusinessMessage({
            whatsappAccessToken,
            whatsappPhoneNumberId,
            whatsappRecipient,
            whatsappTemplateName,
            whatsappTemplateLanguageCode,
            whatsappApiVersion,
            whatsappTemplateParameters,
            textBody: whatsappText
          })
          console.log('[Stripe webhook] WhatsApp enviado', {
            paymentIntentId: paymentIntent?.id,
            recipient: whatsappResult?.recipient || 'unknown',
            messageId: whatsappResult?.responsePayload?.messages?.[0]?.id || 'unknown'
          })
        } catch (error) {
          // Notification failures should not fail webhook ack to Stripe.
          console.warn('[Stripe webhook] fallo envio por WhatsApp:', error?.message || error)
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
