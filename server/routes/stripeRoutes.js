import { Router } from 'express'
import crypto from 'node:crypto'
import {
  buildOrderFingerprint,
  buildTrustedOrderFromClientItems,
  validateOrderId
} from '../services/trustedOrderService.js'

const INTENT_TTL_MS = 30 * 60 * 1000

export function createStripeRouter({ stripeSecretKey }) {
  const router = Router()
  const MAX_METADATA_LENGTH = 500
  const intentByOrderId = new Map()

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
        if (existingIntent.fingerprint !== fingerprint) {
          return res.status(409).json({ error: 'La orden ya existe con un carrito distinto. Recarga la pagina.' })
        }
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

      const receiptEmail = String(customer?.email || '').trim()
      if (receiptEmail) {
        params.append('receipt_email', receiptEmail)
      }

      const response = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
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

  return router
}
