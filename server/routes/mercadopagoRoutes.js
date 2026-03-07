/* global process */
import { Router } from 'express'
import { Preference, Payment } from 'mercadopago'
import crypto from 'node:crypto'
import {
  buildOrderFingerprint,
  buildTrustedOrderFromClientItems,
  validateOrderId
} from '../services/trustedOrderService.js'

const ORDER_TTL_MS = 30 * 60 * 1000
// In-memory order state to reduce duplicate charges on retries.
const paymentByOrderId = new Map()

export function createMercadoPagoRouter({ mpClient, mercadopagoToken, mpCheckoutMode }) {
  const router = Router()

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
            delivery_city: String(delivery?.city || ''),
            delivery_address: String(delivery?.streetAddress || ''),
            delivery_postal_code: String(delivery?.postalCode || ''),
            delivery_neighborhood: String(delivery?.neighborhood || ''),
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
          metadata: {
            order_id: normalizedOrderId,
            customer_name: String(customer?.fullName || ''),
            customer_phone: String(customer?.phone || ''),
            fulfillment_type: String(delivery?.fulfillmentType || 'delivery'),
            delivery_city: String(delivery?.city || ''),
            delivery_address: String(delivery?.streetAddress || ''),
            delivery_postal_code: String(delivery?.postalCode || ''),
            delivery_neighborhood: String(delivery?.neighborhood || ''),
            delivery_notes: String(delivery?.specialInstructions || ''),
            delivery_date: String(delivery?.date || ''),
            delivery_time: String(delivery?.time || ''),
            cart_items_count: trustedOrder.items.length,
            cart_items_summary: trustedOrder.items
              .map((item) => `${item.name} x${item.quantity}`)
              .join(' | ')
          }
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
      console.error('Error procesando pago con Mercado Pago:', error)
      return res.status(500).json({
        error: error?.cause?.[0]?.description || error?.message || 'No se pudo procesar el pago'
      })
    }
  })

  return router
}
