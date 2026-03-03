import { Router } from 'express'

export function createStripeRouter({ stripeSecretKey }) {
  const router = Router()
  const MAX_METADATA_LENGTH = 500

  function toMetadataValue(value) {
    return String(value ?? '').trim().slice(0, MAX_METADATA_LENGTH)
  }

  router.post('/create-payment-intent', async (req, res) => {
    try {
      if (!stripeSecretKey) {
        return res.status(500).json({ error: 'Stripe no configurado en el servidor' })
      }

      const {
        amount,
        currency,
        customer,
        delivery,
        items
      } = req.body || {}

      const parsedAmount = Number(amount)
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Monto invalido para Stripe' })
      }

      const smallestUnitAmount = Math.round(parsedAmount * 100)
      const params = new URLSearchParams()
      params.append('amount', String(smallestUnitAmount))
      params.append('currency', String(currency || 'mxn').toLowerCase())
      params.append('automatic_payment_methods[enabled]', 'true')
      params.append('description', 'Pedido Studio D Flori')
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
      params.append('metadata[cart_items_count]', String(Array.isArray(items) ? items.length : 0))
      params.append(
        'metadata[cart_items_summary]',
        toMetadataValue(
          (Array.isArray(items) ? items : [])
            .map((item) => `${item?.name || 'Producto'} x${Number(item?.quantity) || 1}`)
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

      return res.status(200).json({
        clientSecret: payload.client_secret,
        paymentIntentId: payload.id
      })
    } catch (error) {
      console.error('Error creando Payment Intent con Stripe:', error)
      return res.status(500).json({
        error: error?.message || 'No se pudo iniciar el pago con Stripe'
      })
    }
  })

  return router
}
