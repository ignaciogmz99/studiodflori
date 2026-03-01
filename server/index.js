/* global process */
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

dotenv.config({ path: 'server/.env' })

const app = express()
const port = Number(process.env.PORT || 3001)
const mercadopagoToken = process.env.MERCADO_PAGO_ACCESS_TOKEN
const stripeSecretKey = process.env.STRIPE_SECRET_KEY
const mpCheckoutMode = String(process.env.MP_CHECKOUT_MODE || '').trim().toLowerCase()

if (!mercadopagoToken) {
  console.error('Falta MERCADO_PAGO_ACCESS_TOKEN en server/.env')
}
if (!stripeSecretKey) {
  console.error('Falta STRIPE_SECRET_KEY en server/.env')
}

const mpClient = new MercadoPagoConfig({
  accessToken: mercadopagoToken || ''
})

function maskCredential(value) {
  const text = String(value || '').trim()
  if (!text) {
    return '(vacio)'
  }
  if (text.length <= 12) {
    return `${text.slice(0, 4)}...${text.slice(-2)}`
  }
  return `${text.slice(0, 10)}...${text.slice(-6)}`
}

async function logMercadoPagoCredentialContext() {
  if (!mercadopagoToken) {
    return
  }

  try {
    const response = await fetch('https://api.mercadopago.com/users/me', {
      headers: {
        Authorization: `Bearer ${mercadopagoToken}`
      }
    })

    if (!response.ok) {
      console.warn('[MP] No se pudo validar token en users/me:', response.status)
      return
    }

    const user = await response.json()
    const isTestUser = Array.isArray(user?.tags) && user.tags.includes('test_user')
    console.log(`[MP] Access token cargado: ${maskCredential(mercadopagoToken)}`)
    console.log(`[MP] Usuario: ${user?.nickname || 'desconocido'} | test_user=${isTestUser}`)
  } catch (error) {
    console.warn('[MP] Error validando contexto de credenciales:', error?.message || error)
  }
}

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

app.post('/api/mercadopago/process-payment', async (req, res) => {
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

app.post('/api/stripe/create-payment-intent', async (req, res) => {
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
    params.append('metadata[customer_name]', String(customer?.fullName || ''))
    params.append('metadata[customer_phone]', String(customer?.phone || ''))
    params.append('metadata[delivery_city]', String(delivery?.city || ''))
    params.append('metadata[delivery_address]', String(delivery?.streetAddress || ''))
    params.append('metadata[delivery_date]', String(delivery?.date || ''))
    params.append('metadata[delivery_time]', String(delivery?.time || ''))
    params.append('metadata[cart_items_count]', String(Array.isArray(items) ? items.length : 0))

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

app.listen(port, async () => {
  console.log(`Servidor MP activo en http://localhost:${port}`)
  await logMercadoPagoCredentialContext()
})
