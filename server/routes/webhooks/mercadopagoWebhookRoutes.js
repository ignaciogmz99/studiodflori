/* global Buffer */
import { Router } from 'express'
import crypto from 'node:crypto'
import {
  buildWhatsAppReceiptMessage,
  sendWhatsAppBusinessMessage
} from '../../services/whatsappBusinessService.js'

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
    throw new Error('Falta MP_WEBHOOK_SECRET para validar webhook de Mercado Pago')
  }
  const parsed = parseMercadoPagoSignatureHeader(signatureHeader)
  const ts = String(parsed.ts || '').trim()
  const v1 = String(parsed.v1 || '').trim()
  if (!ts || !v1 || !requestId || !dataId) {
    throw new Error('Encabezados de firma de Mercado Pago invalidos')
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex')

  if (!secureEqualHex(v1, expected)) {
    throw new Error('Firma de Mercado Pago invalida')
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
      const topic = String(req.query?.topic || req.body?.type || '').trim()
      const id = String(req.query?.id || '').trim()
      const dataId = String(req.query?.['data.id'] || req.body?.data?.id || id).trim()
      const signatureHeader = String(req.headers['x-signature'] || '').trim()
      const requestId = String(req.headers['x-request-id'] || '').trim()

      verifyMercadoPagoWebhookSignature({
        signatureHeader,
        requestId,
        dataId,
        webhookSecret: mpWebhookSecret
      })

      if (!mercadopagoToken) {
        throw new Error('Falta MERCADO_PAGO_ACCESS_TOKEN para validar webhook de Mercado Pago')
      }

      const shouldCheckPayment = topic === 'payment' || req.body?.type === 'payment'
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
          const metadata = payment?.metadata || {}
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
            deliveryCity: metadata.delivery_city
          })

          try {
            await sendWhatsAppBusinessMessage({
              whatsappAccessToken,
              whatsappPhoneNumberId,
              whatsappRecipient,
              whatsappTemplateName,
              whatsappTemplateLanguageCode,
              whatsappApiVersion,
              textBody: whatsappText
            })
            console.log('[MP webhook] WhatsApp enviado', {
              paymentId: payment?.id || dataId
            })
          } catch (error) {
            // Keep webhook response successful even if notification failed.
            console.warn('[MP webhook] fallo envio por WhatsApp:', error?.message || error)
          }
        }
      } else {
        console.log('[MP webhook] recibido', { topic, id, dataId })
      }

      // TODO: persistir estado del pago/pedido idempotentemente en base de datos.
      return res.status(200).json({ received: true })
    } catch (error) {
      console.error('Error procesando webhook de Mercado Pago:', error)
      return res.status(400).json({ error: error?.message || 'Error procesando webhook de Mercado Pago' })
    }
  })

  return router
}
