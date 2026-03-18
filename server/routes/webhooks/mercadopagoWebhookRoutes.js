/* global Buffer */
import { Router } from 'express'
import crypto from 'node:crypto'
import {
  buildWhatsAppTemplateParameters,
  buildWhatsAppReceiptMessage,
  sendWhatsAppBusinessMessage
} from '../../services/whatsappBusinessService.js'
import {
  getPaidOrderProcessingState,
  updatePaidOrderProcessingState,
  upsertPaidOrder
} from '../../services/orderPersistenceService.js'
import { createMercadoPagoReceiptPdf } from '../../services/receiptPdfService.js'

function createHttpError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function parseMercadoPagoSignatureHeader(signatureHeader) {
  const entries = String(signatureHeader || '')
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)

  const payload = {}
  for (const entry of entries) {
    const [rawKey, rawValue] = entry.split('=')
    if (!rawKey || !rawValue) {
      continue
    }
    payload[String(rawKey).trim()] = String(rawValue).trim()
  }
  return payload
}

function secureEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'hex')
  const right = Buffer.from(String(b || ''), 'hex')
  if (left.length !== right.length) {
    return false
  }
  return crypto.timingSafeEqual(left, right)
}

function verifyMercadoPagoWebhookSignature({
  signatureHeader,
  requestId,
  dataId,
  webhookSecret
}) {
  const secret = String(webhookSecret || '').trim()
  if (!secret) {
    throw createHttpError('Falta MP_WEBHOOK_SECRET para validar webhook de Mercado Pago', 500)
  }
  const parsed = parseMercadoPagoSignatureHeader(signatureHeader)
  const ts = String(parsed.ts || '').trim()
  const v1 = String(parsed.v1 || '').trim()
  if (!ts || !v1 || !requestId || !dataId) {
    throw createHttpError('Encabezados de firma de Mercado Pago invalidos', 400)
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex')

  if (!secureEqualHex(v1, expected)) {
    throw createHttpError('Firma de Mercado Pago invalida', 400)
  }
}

function resolveMercadoPagoRequestId(headers = {}) {
  const directRequestId = String(headers['x-request-id'] || '').trim()
  if (directRequestId) {
    return {
      requestId: directRequestId,
      requestIdSource: 'x-request-id'
    }
  }

  const railwayRequestId = String(headers['x-railway-request-id'] || '').trim()
  if (railwayRequestId) {
    return {
      requestId: railwayRequestId,
      requestIdSource: 'x-railway-request-id'
    }
  }

  return {
    requestId: '',
    requestIdSource: 'missing'
  }
}

async function fetchMercadoPagoPaymentById({ paymentId, accessToken }) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
  if (!response.ok) {
    const details = await response.text()
    throw new Error(`No se pudo consultar pago en Mercado Pago (${response.status}): ${details}`)
  }
  return response.json()
}

function extractPaymentIdFromResource(resource) {
  const rawValue = String(resource || '').trim()
  if (!rawValue) {
    return ''
  }

  const match = rawValue.match(/\/v1\/payments\/(\d+)/i)
  return String(match?.[1] || '').trim()
}

// Set en memoria para bloquear procesamiento concurrente del mismo paymentId
// dentro del mismo proceso. Previene doble envío de WhatsApp si MP manda
// el mismo webhook dos veces casi simultáneamente.
const activePayments = new Set()

export function createMercadoPagoWebhookRouter({
  mpWebhookSecret,
  mercadopagoToken,
  whatsappAccessToken,
  whatsappPhoneNumberId,
  whatsappRecipient,
  whatsappTemplateName,
  whatsappTemplateLanguageCode,
  whatsappApiVersion
} = {}) {
  const router = Router()

  router.post('/', async (req, res) => {
    try {
      const topic = String(req.query?.topic || req.body?.topic || req.body?.type || '').trim()
      const action = String(req.body?.action || '').trim()
      const id = String(req.query?.id || '').trim()
      const dataId = String(
        req.query?.['data.id']
        || req.body?.data?.id
        || id
        || extractPaymentIdFromResource(req.body?.resource)
      ).trim()
      const signatureHeader = String(req.headers['x-signature'] || '').trim()
      const { requestId, requestIdSource } = resolveMercadoPagoRequestId(req.headers)

      console.log('[MP webhook] request headers', {
        topic,
        action,
        dataId,
        hasSignature: Boolean(signatureHeader),
        requestIdSource,
        hasRequestId: Boolean(requestId)
      })

      verifyMercadoPagoWebhookSignature({
        signatureHeader,
        requestId,
        dataId,
        webhookSecret: mpWebhookSecret
      })

      if (!mercadopagoToken) {
        throw createHttpError('Falta MERCADO_PAGO_ACCESS_TOKEN para validar webhook de Mercado Pago', 500)
      }

      const shouldCheckPayment = topic === 'payment'
        || req.body?.type === 'payment'
        || action.startsWith('payment.')

      if (shouldCheckPayment && dataId) {
        // Always verify latest payment state directly in MP API.
        const payment = await fetchMercadoPagoPaymentById({
          paymentId: dataId,
          accessToken: mercadopagoToken
        })
        console.log('[MP webhook] pago validado', {
          paymentId: payment?.id || dataId,
          status: payment?.status || 'desconocido'
        })

        if (String(payment?.status || '').toLowerCase() === 'approved') {
          const stageErrors = []
          const normalizedPaymentId = String(payment?.id || dataId || '').trim()
          const metadata = payment?.metadata || {}
          const normalizedOrderId = String(metadata.order_id || '').trim()

          // Bloquear procesamiento concurrente del mismo pago en este proceso.
          if (activePayments.has(normalizedPaymentId)) {
            console.log('[MP webhook] pago ya en proceso en esta instancia, omitiendo', {
              paymentId: normalizedPaymentId
            })
            return res.status(200).json({ received: true, inProgress: true })
          }
          activePayments.add(normalizedPaymentId)

          try {
          let existingState = await getPaidOrderProcessingState({
            paymentId: normalizedPaymentId,
            orderId: normalizedOrderId
          })

          if (existingState?.pdf_generated_at && existingState?.whatsapp_sent_at) {
            console.log('[MP webhook] pago ya procesado, se omiten acciones duplicadas', {
              paymentId: normalizedPaymentId
            })
            return res.status(200).json({ received: true, duplicated: true })
          }

          const persistenceMetadata = {
            customer_name: String(metadata.customer_name || '').trim(),
            customer_phone: String(metadata.customer_phone || '').trim(),
            cart_items_summary: String(metadata.cart_items_summary || '').trim(),
            delivery_city: String(metadata.delivery_city || '').trim(),
            delivery_address: String(metadata.delivery_address || '').trim(),
            delivery_neighborhood: String(metadata.delivery_neighborhood || '').trim(),
            delivery_postal_code: String(metadata.delivery_postal_code || '').trim(),
            delivery_date: String(metadata.delivery_date || '').trim(),
            delivery_time: String(metadata.delivery_time || '').trim()
          }

          let persistenceSucceeded = false
          try {
            const persistenceResult = await upsertPaidOrder({
              amountMxn: payment?.transaction_amount,
              customerName: persistenceMetadata.customer_name,
              customerPhone: persistenceMetadata.customer_phone,
              metadata: {
                ...persistenceMetadata,
                order_id: normalizedOrderId
              },
              paidAt: payment?.date_approved || payment?.date_created || new Date().toISOString(),
              paymentId: normalizedPaymentId,
              orderId: normalizedOrderId,
              source: 'mercadopago_webhook'
            })
            persistenceSucceeded = Boolean(persistenceResult?.persisted)
            existingState = persistenceResult?.row || existingState
          } catch (error) {
            stageErrors.push(`persistencia: ${error?.message || error}`)
            console.warn('[MP webhook] fallo persistiendo comprobante:', error?.message || error)
          }

          if (!persistenceSucceeded) {
            throw createHttpError(
              `Fallo post-pago de Mercado Pago (${stageErrors.join(' | ')})`,
              500
            )
          }

          const hasPdf = Boolean(existingState?.pdf_generated_at)
          if (!hasPdf) {
            try {
              const pdfResult = await createMercadoPagoReceiptPdf(payment)
              await updatePaidOrderProcessingState({
                paymentId: normalizedPaymentId,
                orderId: normalizedOrderId,
                pdfPath: pdfResult.filePath,
                pdfGeneratedAt: new Date().toISOString()
              })
              console.log('[MP webhook] PDF generado', {
                paymentId: normalizedPaymentId,
                filePath: pdfResult.filePath
              })
            } catch (error) {
              stageErrors.push(`pdf: ${error?.message || error}`)
              console.warn('[MP webhook] fallo generando PDF:', error?.message || error)
            }
          }

          // Re-leer estado más reciente de DB antes de enviar WhatsApp para
          // detectar si un webhook concurrente ya lo envió y evitar duplicados.
          try {
            const freshState = await getPaidOrderProcessingState({
              paymentId: normalizedPaymentId,
              orderId: normalizedOrderId
            })
            if (freshState) existingState = freshState
          } catch (_) {}

          const whatsappText = buildWhatsAppReceiptMessage({
            provider: 'Mercado Pago',
            paymentId: payment?.id || dataId,
            orderId: metadata.order_id,
            amount: payment?.transaction_amount,
            currency: payment?.currency_id || 'MXN',
            customerName: metadata.customer_name,
            customerPhone: metadata.customer_phone,
            customerEmail: payment?.payer?.email || '',
            deliveryType: String(metadata.fulfillment_type || 'delivery').toLowerCase() === 'pickup'
              ? 'Recoger en tienda'
              : 'Entrega a domicilio',
            deliveryDate: metadata.delivery_date,
            deliveryTime: metadata.delivery_time,
            deliveryCity: metadata.delivery_city,
            deliveryAddress: metadata.delivery_address,
            deliveryNeighborhood: metadata.delivery_neighborhood,
            deliveryPostalCode: metadata.delivery_postal_code,
            recipientName: String(metadata.recipient_name || metadata.customer_name || '').trim(),
            flowerMessage: metadata.flower_message,
            specialInstructions: metadata.delivery_notes,
            cartItemsSummary: metadata.cart_items_summary
          })
          const whatsappTemplateParameters = buildWhatsAppTemplateParameters({
            orderId: metadata.order_id,
            paymentId: payment?.id || dataId,
            customerName: metadata.customer_name,
            recipientName: String(metadata.recipient_name || metadata.customer_name || '').trim(),
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

          const hasWhatsapp = Boolean(existingState?.whatsapp_sent_at)
          if (!hasWhatsapp) {
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
              await updatePaidOrderProcessingState({
                paymentId: normalizedPaymentId,
                orderId: normalizedOrderId,
                whatsappSentAt: new Date().toISOString()
              })
              console.log('[MP webhook] WhatsApp enviado', {
                paymentId: normalizedPaymentId,
                recipient: whatsappResult?.recipient || 'unknown',
                messageId: whatsappResult?.responsePayload?.messages?.[0]?.id || 'unknown'
              })
            } catch (error) {
              stageErrors.push(`notificacion: ${error?.message || error}`)
              console.warn('[MP webhook] fallo enviando notificacion:', error?.message || error)
            }
          }

          if (stageErrors.length > 0) {
            if (!persistenceSucceeded) {
              throw createHttpError(
                `Fallo post-pago de Mercado Pago (${stageErrors.join(' | ')})`,
                500
              )
            }

            console.warn('[MP webhook] post-pago parcial completado', {
              paymentId: normalizedPaymentId,
              errors: stageErrors
            })

            return res.status(200).json({
              received: true,
              processedWithWarnings: true
            })
          }
          } finally {
            activePayments.delete(normalizedPaymentId)
          }
        }
      } else {
        console.log('[MP webhook] recibido', { topic, id, dataId })
      }

      return res.status(200).json({ received: true })
    } catch (error) {
      console.error('Error procesando webhook de Mercado Pago:', {
        message: error?.message || 'Error desconocido',
        statusCode: error?.statusCode || 500
      })
      const statusCode = Number(error?.statusCode)
      return res
        .status(Number.isFinite(statusCode) && statusCode >= 400 ? statusCode : 500)
        .json({ error: error?.message || 'Error procesando webhook de Mercado Pago' })
    }
  })

  return router
}
