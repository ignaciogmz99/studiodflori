/* global Buffer */
import { Router } from 'express'
import crypto from 'node:crypto'
import { getPaidOrderProcessingState } from '../../services/orderPersistenceService.js'
import {
  hasOnlyClaimInProgressWarnings,
  processPaidOrder
} from '../../services/paidOrderProcessingService.js'
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
        const payment = await fetchMercadoPagoPaymentById({
          paymentId: dataId,
          accessToken: mercadopagoToken
        })
        console.log('[MP webhook] pago validado', {
          paymentId: payment?.id || dataId,
          status: payment?.status || 'desconocido'
        })

        if (String(payment?.status || '').toLowerCase() === 'approved') {
          const normalizedPaymentId = String(payment?.id || dataId || '').trim()
          const metadata = payment?.metadata || {}
          const normalizedOrderId = String(metadata.order_id || '').trim()

          if (activePayments.has(normalizedPaymentId)) {
            console.log('[MP webhook] pago ya en proceso en esta instancia, omitiendo', {
              paymentId: normalizedPaymentId
            })
            return res.status(200).json({ received: true, inProgress: true })
          }
          activePayments.add(normalizedPaymentId)

          try {
            const existingState = await getPaidOrderProcessingState({
              paymentId: normalizedPaymentId,
              orderId: normalizedOrderId
            })

            if (existingState?.pdf_generated_at && existingState?.whatsapp_sent_at) {
              console.log('[MP webhook] pago ya procesado, se omiten acciones duplicadas', {
                paymentId: normalizedPaymentId
              })
              return res.status(200).json({ received: true, duplicated: true })
            }

            const processingResult = await processPaidOrder({
              amountMxn: payment?.transaction_amount,
              customerName: String(metadata.customer_name || '').trim(),
              customerPhone: String(metadata.customer_phone || '').trim(),
              metadata: {
                order_id: normalizedOrderId,
                customer_name: String(metadata.customer_name || '').trim(),
                customer_phone: String(metadata.customer_phone || '').trim(),
                recipient_name: String(metadata.recipient_name || '').trim(),
                cart_items_summary: String(metadata.cart_items_summary || '').trim(),
                delivery_city: String(metadata.delivery_city || '').trim(),
                delivery_address: String(metadata.delivery_address || '').trim(),
                delivery_neighborhood: String(metadata.delivery_neighborhood || '').trim(),
                delivery_postal_code: String(metadata.delivery_postal_code || '').trim(),
                delivery_date: String(metadata.delivery_date || '').trim(),
                delivery_time: String(metadata.delivery_time || '').trim(),
                flower_message: String(metadata.flower_message || '').trim(),
                delivery_notes: String(metadata.delivery_notes || '').trim(),
                fulfillment_type: String(metadata.fulfillment_type || 'delivery').trim()
              },
              paidAt: payment?.date_approved || payment?.date_created || new Date().toISOString(),
              paymentId: normalizedPaymentId,
              orderId: normalizedOrderId,
              source: 'mercadopago_webhook',
              createReceiptPdf: () => createMercadoPagoReceiptPdf(payment),
              logLabel: 'MP webhook',
              whatsappAccessToken,
              whatsappPhoneNumberId,
              whatsappRecipient,
              whatsappTemplateName,
              whatsappTemplateLanguageCode,
              whatsappApiVersion
            })

            if (!processingResult.processed) {
              throw createHttpError(
                `Fallo post-pago de Mercado Pago (${processingResult.stageErrors.join(' | ')})`,
                500
              )
            }

            if (processingResult.processedWithWarnings) {
              if (hasOnlyClaimInProgressWarnings(processingResult.stageErrors)) {
                console.log('[MP webhook] post-pago sigue en proceso en otra instancia', {
                  paymentId: normalizedPaymentId,
                  errors: processingResult.stageErrors
                })
                return res.status(200).json({ received: true, inProgress: true })
              }

              console.warn('[MP webhook] post-pago parcial completado', {
                paymentId: normalizedPaymentId,
                errors: processingResult.stageErrors
              })

              throw createHttpError(
                `Post-pago de Mercado Pago incompleto (${processingResult.stageErrors.join(' | ')})`,
                500
              )
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
