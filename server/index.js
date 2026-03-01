/* global process */
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { MercadoPagoConfig } from 'mercadopago'
import { createMercadoPagoRouter } from './routes/mercadopagoRoutes.js'
import { createStripeRouter } from './routes/stripeRoutes.js'
import { createMercadoPagoWebhookRouter } from './routes/webhooks/mercadopagoWebhookRoutes.js'
import { createStripeWebhookRouter } from './routes/webhooks/stripeWebhookRoutes.js'

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

app.use('/api/mercadopago', createMercadoPagoRouter({
  mpClient,
  mercadopagoToken,
  mpCheckoutMode
}))
app.use('/api/stripe', createStripeRouter({ stripeSecretKey }))
app.use('/api/webhooks/mercadopago', createMercadoPagoWebhookRouter())
app.use('/api/webhooks/stripe', createStripeWebhookRouter())

app.listen(port, async () => {
  console.log(`Servidor MP activo en http://localhost:${port}`)
  await logMercadoPagoCredentialContext()
})
