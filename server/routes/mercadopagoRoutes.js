/* global process */
import { Router } from 'express'
import { Preference, Payment } from 'mercadopago'
import crypto from 'node:crypto'
import {
  buildOrderFingerprint,
  buildTrustedOrderFromClientItems,
  validateOrderId
} from '../services/trustedOrderService.js'
import { createMercadoPagoReceiptPdf } from '../services/receiptPdfService.js'
import {
  hasOnlyClaimInProgressWarnings,
  processPaidOrder
} from '../services/paidOrderProcessingService.js'
import { updatePaidOrderProcessingState } from '../services/orderPersistenceService.js'

const ORDER_TTL_MS = 30 * 60 * 1000
// In-memory order state to reduce duplicate charges on retries.
const paymentByOrderId = new Map()

function isAuthorizedPostPaymentRetry(req) {
  const expectedSecret = String(process.env.POST_PAYMENT_RETRY_SECRET || '').trim()
  if (!expectedSecret) {
    return false
  }

  const bearerToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  const headerSecret = String(req.headers['x-post-payment-retry-secret'] || '').trim()
  return bearerToken === expectedSecret || headerSecret === expectedSecret
}

async function fetchMercadoPagoPaymentById({ paymentId, accessToken }) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `No se pudo consultar pago en Mercado Pago (${response.status})`)
  }

  return payload
}

export function createMercadoPagoRouter({ mpClient, mercadopagoToken, mpCheckoutMode }) {
  const router = Router()
  const mpWebhookUrl = String(process.env.MP_WEBHOOK_URL || '').trim()

  async function processApprovedMercadoPagoPostPayment({
    paymentResponse,
    metadata,
    orderId,
    source = 'mercadopago_process_payment',
    logLabel = 'MP process-payment fallback'
  }) {
    const normalizedPaymentId = String(paymentResponse?.id || '').trim()
    const normalizedOrderId = String(orderId || metadata?.order_id || '').trim()
    const normalizedMetadata = {
      order_id: normalizedOrderId,
      customer_name: String(metadata?.customer_name || paymentResponse?.payer?.first_name || '').trim(),
      customer_phone: String(metadata?.customer_phone || '').trim(),
      fulfillment_type: String(metadata?.fulfillment_type || 'delivery').trim() || 'delivery',
      recipient_name: String(metadata?.recipient_name || metadata?.customer_name || paymentResponse?.payer?.first_name || '').trim(),
      delivery_city: String(metadata?.delivery_city || '').trim(),
      delivery_address: String(metadata?.delivery_address || '').trim(),
      delivery_postal_code: String(metadata?.delivery_postal_code || '').trim(),
      delivery_neighborhood: String(metadata?.delivery_neighborhood || '').trim(),
      flower_message: String(metadata?.flower_message || '').trim(),
      delivery_notes: String(metadata?.delivery_notes || '').trim(),
      delivery_date: String(metadata?.delivery_date || '').trim(),
      delivery_time: String(metadata?.delivery_time || '').trim(),
      cart_items_count: metadata?.cart_items_count,
      cart_items_summary: String(metadata?.cart_items_summary || '').trim() || 'Sin detalle'
    }

    return processPaidOrder({
      amountMxn: paymentResponse?.transaction_amount,
      customerName: normalizedMetadata.customer_name,
      customerPhone: normalizedMetadata.customer_phone,
      metadata: normalizedMetadata,
      paidAt: paymentResponse?.date_approved || paymentResponse?.date_created || new Date().toISOString(),
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId,
      source,
      createReceiptPdf: () => createMercadoPagoReceiptPdf({
        ...paymentResponse,
        currency_id: paymentResponse?.currency_id || 'MXN',
        payer: {
          ...(paymentResponse?.payer || {}),
          email: String(paymentResponse?.payer?.email || metadata?.customer_email || '').trim()
        },
        metadata: normalizedMetadata
      }),
      logLabel,
      whatsappAccessToken: process.env.WHATSAPP_BUSINESS_ACCESS_TOKEN,
      whatsappPhoneNumberId: process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID,
      whatsappRecipient: process.env.WHATSAPP_BUSINESS_TO,
      whatsappTemplateName: process.env.WHATSAPP_BUSINESS_TEMPLATE_NAME,
      whatsappTemplateLanguageCode: process.env.WHATSAPP_BUSINESS_TEMPLATE_LANGUAGE || 'es_MX',
      whatsappApiVersion: process.env.WHATSAPP_BUSINESS_API_VERSION || 'v22.0'
    })
  }

  async function runApprovedPaymentFallback({
    paymentResponse,
    orderId,
    customer,
    delivery,
    trustedOrder
  }) {
    const metadata = {
      order_id: orderId,
      customer_name: String(customer?.fullName || '').trim(),
      customer_phone: String(customer?.phone || '').trim(),
      fulfillment_type: String(delivery?.fulfillmentType || 'delivery').trim() || 'delivery',
      recipient_name: String(delivery?.recipientName || customer?.fullName || '').trim(),
      delivery_city: String(delivery?.city || '').trim(),
      delivery_address: String(delivery?.streetAddress || '').trim(),
      delivery_postal_code: String(delivery?.postalCode || '').trim(),
      delivery_neighborhood: String(delivery?.neighborhood || '').trim(),
      flower_message: String(delivery?.flowerMessage || '').trim(),
      delivery_notes: String(delivery?.specialInstructions || '').trim(),
      delivery_date: String(delivery?.date || '').trim(),
      delivery_time: String(delivery?.time || '').trim(),
      cart_items_count: trustedOrder.items.length,
      cart_items_summary: trustedOrder.items
        .map((item) => `${item.name} x${item.quantity}`)
        .join(' | ')
    }

    try {
      const processingResult = await processApprovedMercadoPagoPostPayment({
        paymentResponse: {
          ...paymentResponse,
          payer: {
            ...(paymentResponse?.payer || {}),
            email: String(paymentResponse?.payer?.email || customer?.email || '').trim()
          }
        },
        metadata,
        orderId,
        source: 'mercadopago_process_payment',
        logLabel: 'MP process-payment fallback'
      })

      if (!processingResult.processed) {
        throw new Error(processingResult.stageErrors.join(' | ') || 'No se pudo completar fallback post-pago')
      }

      console.log('[MP process-payment] fallback post-pago completado', {
        orderId,
        paymentId: paymentResponse?.id,
        warnings: processingResult.stageErrors
      })
    } catch (error) {
      console.warn('[MP process-payment] fallo fallback post-pago:', {
        orderId,
        paymentId: paymentResponse?.id || 'unknown',
        message: error?.message || error
      })
    }
  }

  function cleanupExpiredOrders() {
    const now = Date.now()
    for (const [orderId, entry] of paymentByOrderId.entries()) {
      if (!entry?.expiresAt || entry.expiresAt <= now) {
        paymentByOrderId.delete(orderId)
      }
    }
  }

  router.post('/create-preference', async (req, res) => {
    try {
      if (!mercadopagoToken) {
        return res.status(500).json({ error: 'Mercado Pago no configurado en el servidor' })
      }

      const {
        orderId,
        items,
        customer,
        delivery
      } = req.body || {}

      const normalizedOrderId = validateOrderId(orderId)
      // Prices are recalculated from trusted catalog data.
      const trustedOrder = await buildTrustedOrderFromClientItems(items)
      const mappedItems = trustedOrder.items
        .map((item) => ({
          title: item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          currency_id: 'MXN'
        }))
        .filter((item) => item.unit_price > 0)

      if (mappedItems.length === 0) {
        return res.status(400).json({ error: 'Los productos del carrito no tienen precio valido' })
      }

      const preference = new Preference(mpClient)
      const payerEmail = String(customer?.email || '').trim()
      const isTestToken = mercadopagoToken.startsWith('TEST-')
      const useSandboxCheckout = mpCheckoutMode === 'sandbox' || isTestToken
      const checkoutSuccessUrl = process.env.CHECKOUT_SUCCESS_URL || 'http://localhost:5173'
      const checkoutFailureUrl = process.env.CHECKOUT_FAILURE_URL || 'http://localhost:5173'
      const checkoutPendingUrl = process.env.CHECKOUT_PENDING_URL || 'http://localhost:5173'
      const response = await preference.create({
        body: {
          items: mappedItems,
          payer: (!isTestToken && payerEmail)
            ? { email: payerEmail }
            : undefined,
          metadata: {
            order_id: normalizedOrderId,
            customer_name: String(customer?.fullName || ''),
            customer_phone: String(customer?.phone || ''),
            fulfillment_type: String(delivery?.fulfillmentType || 'delivery'),
            recipient_name: String(delivery?.recipientName || customer?.fullName || ''),
            delivery_city: String(delivery?.city || ''),
            delivery_address: String(delivery?.streetAddress || ''),
            delivery_postal_code: String(delivery?.postalCode || ''),
            delivery_neighborhood: String(delivery?.neighborhood || ''),
            flower_message: String(delivery?.flowerMessage || ''),
            delivery_notes: String(delivery?.specialInstructions || ''),
            delivery_date: String(delivery?.date || ''),
            delivery_time: String(delivery?.time || ''),
            cart_items_count: trustedOrder.items.length,
            cart_items_summary: trustedOrder.items
              .map((item) => `${item.name} x${item.quantity}`)
              .join(' | ')
          },
          back_urls: {
            success: checkoutSuccessUrl,
            failure: checkoutFailureUrl,
            pending: checkoutPendingUrl
          },
          notification_url: process.env.MP_WEBHOOK_URL || undefined
        }
      })

      const checkoutUrl = useSandboxCheckout
        ? (response.sandbox_init_point || response.init_point)
        : (response.init_point || response.sandbox_init_point)

      return res.json({
        orderId: normalizedOrderId,
        preferenceId: response.id,
        checkoutUrl,
        useSandboxCheckout,
        initPoint: response.init_point,
        sandboxInitPoint: response.sandbox_init_point
      })
    } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('invalido')
        || String(error?.message || '').toLowerCase().includes('no hay productos')
        || String(error?.message || '').toLowerCase().includes('producto invalido')
      ) {
        return res.status(400).json({ error: error.message })
      }
      console.error('Error creando preferencia de Mercado Pago:', error)
      return res.status(500).json({
        error: error?.message || 'No se pudo iniciar el pago con Mercado Pago'
      })
    }
  })

  router.post('/process-payment', async (req, res) => {
    try {
      if (!mercadopagoToken) {
        return res.status(500).json({ error: 'Mercado Pago no configurado en el servidor' })
      }

      const {
        orderId,
        token,
        issuer_id,
        payment_method_id,
        installments,
        payer,
        customer,
        delivery,
        items
      } = req.body || {}

      cleanupExpiredOrders()
      const normalizedOrderId = validateOrderId(orderId)
      console.log('[MP process-payment] request', {
        orderId: normalizedOrderId,
        hasToken: Boolean(token),
        paymentMethodId: String(payment_method_id || '').trim() || 'missing',
        installments: Number(installments) > 0 ? Number(installments) : 1,
        itemsCount: Array.isArray(items) ? items.length : 0
      })
      // Never trust client-side totals for payment amount.
      const trustedOrder = await buildTrustedOrderFromClientItems(items)
      if (!token || !payment_method_id || !Number.isFinite(trustedOrder.amount) || trustedOrder.amount <= 0) {
        return res.status(400).json({ error: 'Faltan datos para procesar el pago' })
      }

      const fingerprint = buildOrderFingerprint({
        orderId: normalizedOrderId,
        items: trustedOrder.items
      })
      const existing = paymentByOrderId.get(normalizedOrderId)
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return res.status(409).json({ error: 'La orden ya existe con un carrito distinto. Recarga la pagina.' })
        }
        if (existing.status === 'processing') {
          return res.status(409).json({ error: 'Esta orden ya se esta procesando. Espera unos segundos.' })
        }
        return res.status(200).json(existing.response)
      }

      paymentByOrderId.set(normalizedOrderId, {
        fingerprint,
        status: 'processing',
        response: null,
        expiresAt: Date.now() + ORDER_TTL_MS
      })

      const payment = new Payment(mpClient)
      const paymentMetadata = {
        order_id: normalizedOrderId,
        customer_name: String(customer?.fullName || ''),
        customer_phone: String(customer?.phone || ''),
        fulfillment_type: String(delivery?.fulfillmentType || 'delivery'),
        recipient_name: String(delivery?.recipientName || customer?.fullName || ''),
        delivery_city: String(delivery?.city || ''),
        delivery_address: String(delivery?.streetAddress || ''),
        delivery_postal_code: String(delivery?.postalCode || ''),
        delivery_neighborhood: String(delivery?.neighborhood || ''),
        flower_message: String(delivery?.flowerMessage || ''),
        delivery_notes: String(delivery?.specialInstructions || ''),
        delivery_date: String(delivery?.date || ''),
        delivery_time: String(delivery?.time || ''),
        cart_items_count: trustedOrder.items.length,
        cart_items_summary: trustedOrder.items
          .map((item) => `${item.name} x${item.quantity}`)
          .join(' | ')
      }
      const response = await payment.create({
        body: {
          token: String(token),
          issuer_id: issuer_id ? String(issuer_id) : undefined,
          payment_method_id: String(payment_method_id),
          transaction_amount: Number(trustedOrder.amount.toFixed(2)),
          installments: Number(installments) > 0 ? Number(installments) : 1,
          description: 'Pedido Studio D Flori',
          payer: {
            email: String(payer?.email || customer?.email || '').trim() || undefined,
            identification: payer?.identification || undefined
          },
          metadata: paymentMetadata,
          notification_url: mpWebhookUrl || undefined
        },
        requestOptions: {
          // Mercado Pago SDK idempotency key to deduplicate retries upstream.
          idempotencyKey: crypto
            .createHash('sha256')
            .update(`mp:${fingerprint}`)
            .digest('hex')
        }
      })

      const responsePayload = {
        id: response.id,
        status: response.status,
        status_detail: response.status_detail
      }

      console.log('[MP process-payment] response', {
        orderId: normalizedOrderId,
        paymentId: response.id,
        status: response.status,
        statusDetail: response.status_detail
      })

      const shouldQueuePostPaymentFallback = String(response?.status || '').toLowerCase() === 'approved'
      if (shouldQueuePostPaymentFallback) {
        void runApprovedPaymentFallback({
          paymentResponse: response,
          orderId: normalizedOrderId,
          customer,
          delivery,
          trustedOrder
        })
      }

      paymentByOrderId.set(normalizedOrderId, {
        fingerprint,
        status: 'completed',
        response: responsePayload,
        expiresAt: Date.now() + ORDER_TTL_MS
      })

      return res.status(200).json(responsePayload)
    } catch (error) {
      const normalizedOrderId = String(req.body?.orderId || '').trim()
      if (normalizedOrderId) {
        paymentByOrderId.delete(normalizedOrderId)
      }
      if (String(error?.message || '').toLowerCase().includes('invalido')
        || String(error?.message || '').toLowerCase().includes('no hay productos')
        || String(error?.message || '').toLowerCase().includes('producto invalido')
      ) {
        return res.status(400).json({ error: error.message })
      }
      console.error('Error procesando pago con Mercado Pago:', {
        message: error?.message || 'Error desconocido',
        cause: error?.cause || null,
        orderId: normalizedOrderId || 'unknown'
      })
      return res.status(500).json({
        error: error?.cause?.[0]?.description || error?.message || 'No se pudo procesar el pago'
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

      if (!mercadopagoToken) {
        return res.status(500).json({ error: 'Mercado Pago no configurado en el servidor' })
      }

      const paymentId = String(req.body?.paymentId || req.body?.id || '').trim()
      if (!paymentId) {
        return res.status(400).json({ error: 'Falta paymentId para reintentar post-pago' })
      }

      const payment = await fetchMercadoPagoPaymentById({
        paymentId,
        accessToken: mercadopagoToken
      })

      if (String(payment?.status || '').toLowerCase() !== 'approved') {
        return res.status(409).json({
          error: 'El pago de Mercado Pago todavia no esta aprobado',
          status: payment?.status || 'unknown'
        })
      }

      const metadata = payment?.metadata || {}
      const orderId = String(req.body?.orderId || metadata?.order_id || '').trim()
      validateOrderId(orderId)

      const metadataOrderId = String(metadata?.order_id || '').trim()
      if (metadataOrderId && metadataOrderId !== orderId) {
        return res.status(409).json({ error: 'El pago de Mercado Pago no corresponde a esta orden' })
      }

      if (req.body?.force === true || req.body?.clearClaims === true) {
        await updatePaidOrderProcessingState({
          paymentId,
          orderId,
          pdfProcessingStartedAt: null,
          whatsappProcessingStartedAt: null,
          pdfProcessingOwner: null,
          whatsappProcessingOwner: null,
          processingLastEvent: 'manual_retry_claims_cleared',
          processingLastError: null,
          processingLastActor: 'MP manual retry',
          processingUpdatedAt: new Date().toISOString()
        })
      }

      const processingResult = await processApprovedMercadoPagoPostPayment({
        paymentResponse: payment,
        metadata,
        orderId,
        source: 'mercadopago_manual_retry',
        logLabel: 'MP manual retry'
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
      console.error('[MP manual retry] fallo reintentando post-pago:', {
        message: error?.message || error
      })
      return res.status(500).json({
        error: error?.message || 'No se pudo reintentar el post-pago de Mercado Pago'
      })
    }
  })

  return router
}
