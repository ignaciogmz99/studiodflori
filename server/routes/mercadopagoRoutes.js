import { Router } from 'express'
import { Preference, Payment } from 'mercadopago'

export function createMercadoPagoRouter({ mpClient, mercadopagoToken, mpCheckoutMode }) {
  const router = Router()

  router.post('/create-preference', async (req, res) => {
    try {
      if (!mercadopagoToken) {
        return res.status(500).json({ error: 'Mercado Pago no configurado en el servidor' })
      }

      const {
        items,
        customer,
        delivery
      } = req.body || {}

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'No hay productos para procesar el pago' })
      }

      const mappedItems = items
        .map((item) => ({
          title: String(item.name || 'Producto floral'),
          quantity: Math.max(1, Number(item.quantity) || 1),
          unit_price: Math.max(0, Number(item.price) || 0),
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
            customer_name: String(customer?.fullName || ''),
            customer_phone: String(customer?.phone || ''),
            delivery_city: String(delivery?.city || ''),
            delivery_address: String(delivery?.streetAddress || ''),
            delivery_postal_code: String(delivery?.postalCode || ''),
            delivery_neighborhood: String(delivery?.neighborhood || ''),
            delivery_notes: String(delivery?.specialInstructions || ''),
            delivery_date: String(delivery?.date || ''),
            delivery_time: String(delivery?.time || '')
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
        preferenceId: response.id,
        checkoutUrl,
        useSandboxCheckout,
        initPoint: response.init_point,
        sandboxInitPoint: response.sandbox_init_point
      })
    } catch (error) {
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
        token,
        issuer_id,
        payment_method_id,
        transaction_amount,
        installments,
        payer,
        customer,
        delivery,
        items
      } = req.body || {}

      const amount = Number(transaction_amount)
      if (!token || !payment_method_id || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Faltan datos para procesar el pago' })
      }

      const payment = new Payment(mpClient)
      const response = await payment.create({
        body: {
          token: String(token),
          issuer_id: issuer_id ? String(issuer_id) : undefined,
          payment_method_id: String(payment_method_id),
          transaction_amount: Number(amount.toFixed(2)),
          installments: Number(installments) > 0 ? Number(installments) : 1,
          description: 'Pedido Studio D Flori',
          payer: {
            email: String(payer?.email || customer?.email || '').trim() || undefined,
            identification: payer?.identification || undefined
          },
          metadata: {
            customer_name: String(customer?.fullName || ''),
            customer_phone: String(customer?.phone || ''),
            delivery_city: String(delivery?.city || ''),
            delivery_address: String(delivery?.streetAddress || ''),
            delivery_postal_code: String(delivery?.postalCode || ''),
            delivery_neighborhood: String(delivery?.neighborhood || ''),
            delivery_notes: String(delivery?.specialInstructions || ''),
            delivery_date: String(delivery?.date || ''),
            delivery_time: String(delivery?.time || ''),
            cart_items_count: Array.isArray(items) ? items.length : 0
          }
        }
      })

      return res.status(200).json({
        id: response.id,
        status: response.status,
        status_detail: response.status_detail
      })
    } catch (error) {
      console.error('Error procesando pago con Mercado Pago:', error)
      return res.status(500).json({
        error: error?.cause?.[0]?.description || error?.message || 'No se pudo procesar el pago'
      })
    }
  })

  return router
}
