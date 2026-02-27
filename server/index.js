import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { MercadoPagoConfig, Preference } from 'mercadopago'

dotenv.config({ path: 'server/.env' })

const app = express()
const port = Number(process.env.PORT || 3001)
const mercadopagoToken = process.env.MERCADO_PAGO_ACCESS_TOKEN

if (!mercadopagoToken) {
  console.error('Falta MERCADO_PAGO_ACCESS_TOKEN en server/.env')
}

const mpClient = new MercadoPagoConfig({
  accessToken: mercadopagoToken || ''
})

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
}))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/mercadopago/create-preference', async (req, res) => {
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
    const checkoutSuccessUrl = process.env.CHECKOUT_SUCCESS_URL || 'http://localhost:5173'
    const checkoutFailureUrl = process.env.CHECKOUT_FAILURE_URL || 'http://localhost:5173'
    const checkoutPendingUrl = process.env.CHECKOUT_PENDING_URL || 'http://localhost:5173'
    const response = await preference.create({
      body: {
        items: mappedItems,
        payer: customer?.email
          ? { email: String(customer.email) }
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

    return res.json({
      preferenceId: response.id,
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

app.listen(port, () => {
  console.log(`Servidor MP activo en http://localhost:${port}`)
})
