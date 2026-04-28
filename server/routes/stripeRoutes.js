/* global process */
import { Router } from 'express'
import crypto from 'node:crypto'
import {
  buildOrderFingerprint,
  buildTrustedOrderFromClientItems,
  validateOrderId
} from '../services/trustedOrderService.js'
import {
  hasOnlyClaimInProgressWarnings,
  processPaidOrder
} from '../services/paidOrderProcessingService.js'
import { createStripeReceiptPdf } from '../services/receiptPdfService.js'
import { updatePaidOrderProcessingState } from '../services/orderPersistenceService.js'

const INTENT_TTL_MS = 30 * 60 * 1000

function isAuthorizedPostPaymentRetry(req) {
  const expectedSecret = String(process.env.POST_PAYMENT_RETRY_SECRET || '').trim()
  if (!expectedSecret) {
    return false
  }

  const bearerToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  const headerSecret = String(req.headers['x-post-payment-retry-secret'] || '').trim()
  return bearerToken === expectedSecret || headerSecret === expectedSecret
}

export function createStripeRouter({ stripeSecretKey }) {
  const router = Router()
  const MAX_METADATA_LENGTH = 500
  // In-memory cache to keep intent idempotency during a short window.
  const intentByOrderId = new Map()

  async function fetchStripePaymentIntent(paymentIntentId) {
    const response = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`
      }
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error?.message || `No se pudo consultar PaymentIntent (${response.status})`)
    }

    return payload
  }

  async function runStripePostPaymentFallback({
    paymentIntent,
    orderId,
    source = 'stripe_client_fallback',
    logLabel = 'Stripe client fallback'
  }) {
    const metadata = paymentIntent?.metadata || {}
    return processPaidOrder({
      amountMxn: Number(paymentIntent?.amount_received ?? paymentIntent?.amount ?? 0) / 100,
      customerName: String(metadata.customer_name || '').trim(),
      customerPhone: String(metadata.customer_phone || '').trim(),
      metadata: {
        order_id: orderId,
        customer_name: String(metadata.customer_name || '').trim(),
        customer_phone: String(metadata.customer_phone || '').trim(),
        customer_email: String(metadata.customer_email || paymentIntent?.receipt_email || '').trim(),
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
      paidAt: new Date().toISOString(),
      paymentId: String(paymentIntent?.id || '').trim(),
      orderId,
      source,
      createReceiptPdf: () => createStripeReceiptPdf(paymentIntent),
      logLabel,
      whatsappAccessToken: process.env.WHATSAPP_BUSINESS_ACCESS_TOKEN,
      whatsappPhoneNumberId: process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID,
      whatsappRecipient: process.env.WHATSAPP_BUSINESS_TO,
      whatsappTemplateName: process.env.WHATSAPP_BUSINESS_TEMPLATE_NAME,
      whatsappTemplateLanguageCode: process.env.WHATSAPP_BUSINESS_TEMPLATE_LANGUAGE || 'es_MX',
      whatsappApiVersion: process.env.WHATSAPP_BUSINESS_API_VERSION || 'v22.0'
    })
  }

  function toMetadataValue(value) {
    return String(value ?? '').trim().slice(0, MAX_METADATA_LENGTH)
  }

  function cleanupExpiredIntents() {
    const now = Date.now()
    for (const [orderId, entry] of intentByOrderId.entries()) {
      if (!entry?.expiresAt || entry.expiresAt <= now) {
        intentByOrderId.delete(orderId)
      }
    }
  }

  router.post('/create-payment-intent', async (req, res) => {
    try {
      if (!stripeSecretKey) {
        return res.status(500).json({ error: 'Stripe no configurado en el servidor' })
      }

      const {
        orderId,
        customer,
        delivery,
        items
      } = req.body || {}

      cleanupExpiredIntents()
      const normalizedOrderId = validateOrderId(orderId)
      // Build a server-trusted cart: prices come from Supabase, not from client payload.
      const trustedOrder = await buildTrustedOrderFromClientItems(items)
      if (!Number.isFinite(trustedOrder.amount) || trustedOrder.amount <= 0) {
        return res.status(400).json({ error: 'Monto invalido para Stripe' })
      }
      const fingerprint = buildOrderFingerprint({
        orderId: normalizedOrderId,
        items: trustedOrder.items
      })

      const existingIntent = intentByOrderId.get(normalizedOrderId)
      if (existingIntent) {
        // Same order id but different cart is treated as conflict.
        if (existingIntent.fingerprint !== fingerprint) {
          return res.status(409).json({ error: 'La orden ya existe con un carrito distinto. Recarga la pagina.' })
        }
        // Return existing intent to keep frontend retries safe.
        return res.status(200).json({
          clientSecret: existingIntent.clientSecret,
          paymentIntentId: existingIntent.paymentIntentId,
          amount: existingIntent.amount
        })
      }

      const smallestUnitAmount = Math.round(trustedOrder.amount * 100)
      const params = new URLSearchParams()
      params.append('amount', String(smallestUnitAmount))
      params.append('currency', 'mxn')
      params.append('automatic_payment_methods[enabled]', 'true')
      params.append('description', 'Pedido Studio D Flori')
      params.append('metadata[order_id]', toMetadataValue(normalizedOrderId))
      params.append('metadata[customer_name]', toMetadataValue(customer?.fullName))
      params.append('metadata[customer_phone]', toMetadataValue(customer?.phone))
      params.append('metadata[customer_email]', toMetadataValue(customer?.email))
      params.append('metadata[fulfillment_type]', toMetadataValue(delivery?.fulfillmentType || 'delivery'))
      params.append('metadata[delivery_city]', toMetadataValue(delivery?.city))
      params.append('metadata[delivery_address]', toMetadataValue(delivery?.streetAddress))
      params.append('metadata[delivery_neighborhood]', toMetadataValue(delivery?.neighborhood))
      params.append('metadata[delivery_postal_code]', toMetadataValue(delivery?.postalCode))
      params.append('metadata[delivery_notes]', toMetadataValue(delivery?.specialInstructions))
      params.append('metadata[delivery_date]', toMetadataValue(delivery?.date))
      params.append('metadata[delivery_time]', toMetadataValue(delivery?.time))
      params.append('metadata[cart_items_count]', String(trustedOrder.items.length))
      params.append(
        'metadata[cart_items_summary]',
        toMetadataValue(
          trustedOrder.items
            .map((item) => `${item.name} x${item.quantity}`)
            .join(' | ')
        )
      )
      params.append('metadata[recipient_name]', toMetadataValue(delivery?.recipientName))
      params.append('metadata[flower_message]', toMetadataValue(delivery?.flowerMessage))

      const receiptEmail = String(customer?.email || '').trim()
      if (receiptEmail) {
        params.append('receipt_email', receiptEmail)
      }

      const response = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          // Stripe-level idempotency key derived from stable order fingerprint.
          'Idempotency-Key': crypto
            .createHash('sha256')
            .update(`stripe:${fingerprint}`)
            .digest('hex'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      })

      const payload = await response.json()
      if (!response.ok) {
        return res.status(response.status).json({
          error: payload?.error?.message || 'No se pudo crear el Payment Intent con Stripe'
        })
      }

      intentByOrderId.set(normalizedOrderId, {
        fingerprint,
        clientSecret: payload.client_secret,
        paymentIntentId: payload.id,
        amount: trustedOrder.amount,
        expiresAt: Date.now() + INTENT_TTL_MS
      })

      return res.status(200).json({
        clientSecret: payload.client_secret,
        paymentIntentId: payload.id,
        amount: trustedOrder.amount
      })
    } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('invalido')
        || String(error?.message || '').toLowerCase().includes('no hay productos')
        || String(error?.message || '').toLowerCase().includes('producto invalido')
      ) {
        return res.status(400).json({ error: error.message })
      }
      console.error('Error creando Payment Intent con Stripe:', error)
      return res.status(500).json({
        error: error?.message || 'No se pudo iniciar el pago con Stripe'
      })
    }
  })

  router.post('/process-succeeded-payment', async (req, res) => {
    try {
      if (!stripeSecretKey) {
        return res.status(500).json({ error: 'Stripe no configurado en el servidor' })
      }

      const paymentIntentId = String(req.body?.paymentIntentId || '').trim()
      const normalizedOrderId = validateOrderId(req.body?.orderId)

      if (!paymentIntentId) {
        return res.status(400).json({ error: 'Falta paymentIntentId para validar el pago de Stripe' })
      }

      const paymentIntent = await fetchStripePaymentIntent(paymentIntentId)
      const metadataOrderId = String(paymentIntent?.metadata?.order_id || '').trim()

      if (metadataOrderId !== normalizedOrderId) {
        return res.status(409).json({ error: 'El PaymentIntent no corresponde a esta orden' })
      }

      if (String(paymentIntent?.status || '').toLowerCase() !== 'succeeded') {
        return res.status(409).json({ error: 'El pago de Stripe todavia no esta aprobado' })
      }

      const processingResult = await runStripePostPaymentFallback({
        paymentIntent,
        orderId: normalizedOrderId
      })

      if (!processingResult.processed) {
        return res.status(500).json({
          error: processingResult.stageErrors.join(' | ') || 'No se pudo completar el post-pago de Stripe'
        })
      }

      if (processingResult.processedWithWarnings) {
        if (hasOnlyClaimInProgressWarnings(processingResult.stageErrors)) {
          console.log('[Stripe client fallback] post-pago sigue en proceso en otra instancia', {
            paymentId: processingResult.paymentId,
            orderId: processingResult.orderId,
            warnings: processingResult.stageErrors
          })
          return res.status(202).json({
            processed: false,
            inProgress: true,
            paymentId: processingResult.paymentId,
            orderId: processingResult.orderId,
            warnings: processingResult.stageErrors
          })
        }

        return res.status(500).json({
          error: `Post-pago Stripe incompleto (${processingResult.stageErrors.join(' | ')})`
        })
      }

      return res.status(200).json({
        processed: true,
        paymentId: processingResult.paymentId,
        orderId: processingResult.orderId
      })
    } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('orderid invalido')) {
        return res.status(400).json({ error: error.message })
      }
      console.error('Error procesando fallback de Stripe:', error)
      return res.status(500).json({
        error: error?.message || 'No se pudo procesar el post-pago de Stripe'
      })
    }
  })

  router.post('/retry-post-payment', async (req, res) => {
    try {
      if (!isAuthorizedPostPaymentRetry(req)) {
        return res.status(process.env.POST_PAYMENT_RETRY_SECRET ? 401 : 500).json({
          error: process.env.POST_PAYMENT_RETRY_SECRET
            ? 'No autorizado'
            : 'Falta POST_PAYMENT_RETRY_SECRET para habilitar reintentos protegidos'
        })
      }

      if (!stripeSecretKey) {
        return res.status(500).json({ error: 'Stripe no configurado en el servidor' })
      }

      const paymentIntentId = String(req.body?.paymentIntentId || req.body?.paymentId || '').trim()
      if (!paymentIntentId) {
        return res.status(400).json({ error: 'Falta paymentIntentId para reintentar post-pago' })
      }

      const paymentIntent = await fetchStripePaymentIntent(paymentIntentId)
      if (String(paymentIntent?.status || '').toLowerCase() !== 'succeeded') {
        return res.status(409).json({
          error: 'El pago de Stripe todavia no esta aprobado',
          status: paymentIntent?.status || 'unknown'
        })
      }

      const metadataOrderId = String(paymentIntent?.metadata?.order_id || '').trim()
      const normalizedOrderId = validateOrderId(req.body?.orderId || metadataOrderId)

      if (metadataOrderId && metadataOrderId !== normalizedOrderId) {
        return res.status(409).json({ error: 'El PaymentIntent no corresponde a esta orden' })
      }

      if (req.body?.force === true || req.body?.clearClaims === true) {
        await updatePaidOrderProcessingState({
          paymentId: paymentIntentId,
          orderId: normalizedOrderId,
          pdfProcessingStartedAt: null,
          whatsappProcessingStartedAt: null,
          pdfProcessingOwner: null,
          whatsappProcessingOwner: null,
          processingLastEvent: 'manual_retry_claims_cleared',
          processingLastError: null,
          processingLastActor: 'Stripe manual retry',
          processingUpdatedAt: new Date().toISOString()
        })
      }

      if (req.body?.regeneratePdf === true || req.body?.forcePdf === true) {
        await updatePaidOrderProcessingState({
          paymentId: paymentIntentId,
          orderId: normalizedOrderId,
          pdfPath: null,
          pdfGeneratedAt: null,
          pdfProcessingStartedAt: null,
          pdfProcessingOwner: null,
          processingLastEvent: 'manual_retry_pdf_reset',
          processingLastError: null,
          processingLastActor: 'Stripe manual retry',
          processingUpdatedAt: new Date().toISOString()
        })
      }

      const processingResult = await runStripePostPaymentFallback({
        paymentIntent,
        orderId: normalizedOrderId,
        source: 'stripe_manual_retry',
        logLabel: 'Stripe manual retry'
      })

      const responsePayload = {
        processed: Boolean(processingResult.processed && !processingResult.processedWithWarnings),
        inProgress: hasOnlyClaimInProgressWarnings(processingResult.stageErrors),
        paymentId: processingResult.paymentId,
        orderId: processingResult.orderId,
        warnings: processingResult.stageErrors,
        state: processingResult.state || null
      }

      return res
        .status(responsePayload.processed ? 200 : (responsePayload.inProgress ? 202 : 500))
        .json(responsePayload)
    } catch (error) {
      console.error('[Stripe manual retry] fallo reintentando post-pago:', {
        message: error?.message || error
      })
      return res.status(500).json({
        error: error?.message || 'No se pudo reintentar el post-pago de Stripe'
      })
    }
  })

  return router
}
