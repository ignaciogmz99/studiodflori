/* global process */
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { MercadoPagoConfig } from 'mercadopago'
import { createMercadoPagoRouter } from './routes/mercadopagoRoutes.js'
import { createStripeRouter } from './routes/stripeRoutes.js'
import { createMercadoPagoWebhookRouter } from './routes/webhooks/mercadopagoWebhookRoutes.js'
import { createStripeWebhookRouter } from './routes/webhooks/stripeWebhookRoutes.js'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(serverDir, '.env') })

const app = express()
const port = Number(process.env.PORT || 3001)
const mercadopagoToken = process.env.MERCADO_PAGO_ACCESS_TOKEN
const stripeSecretKey = process.env.STRIPE_SECRET_KEY
const mpCheckoutMode = String(process.env.MP_CHECKOUT_MODE || '').trim().toLowerCase()

// Warn early when critical credentials are missing.
if (!mercadopagoToken) {
  console.error('Falta MERCADO_PAGO_ACCESS_TOKEN en server/.env')
}
if (!stripeSecretKey) {
  console.error('Falta STRIPE_SECRET_KEY en server/.env')
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en server/.env')
}
if (!process.env.MP_WEBHOOK_URL) {
  console.warn('Falta MP_WEBHOOK_URL en server/.env; Mercado Pago no podra notificar pagos al webhook')
}

const mpClient = new MercadoPagoConfig({
  accessToken: mercadopagoToken || ''
})

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
    console.log('[MP] Access token cargado correctamente')
    console.log(`[MP] Usuario: ${user?.nickname || 'desconocido'} | test_user=${isTestUser}`)
  } catch (error) {
    console.warn('[MP] Error validando contexto de credenciales:', error?.message || error)
  }
}

// Lightweight in-memory rate limiter (per ip + path).
// Works correctly for a single server instance. For multi-instance deployments
// (e.g. horizontal scaling) replace with a shared store such as Redis.
function createMemoryRateLimiter({ windowMs, maxRequests }) {
  const hits = new Map()

  // Purge expired entries every windowMs to prevent unbounded memory growth.
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits.entries()) {
      if (entry.resetAt <= now) {
        hits.delete(key)
      }
    }
  }, windowMs)
  // Do not keep the process alive solely for cleanup.
  cleanupInterval.unref()

  return (req, res, next) => {
    const now = Date.now()
    const key = `${req.ip}:${req.path}`
    const current = hits.get(key)

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    if (current.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSeconds)))
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta de nuevo en unos segundos.' })
    }

    current.count += 1
    hits.set(key, current)
    return next()
  }
}

const paymentsRateLimiter = createMemoryRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30
})
const webhooksRateLimiter = createMemoryRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120
})

// Allow frontend origin configured in env.
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
}))

// Stripe webhook must read raw body to verify signature exactly as received.
app.use(
  '/api/webhooks/stripe',
  webhooksRateLimiter,
  express.raw({ type: 'application/json' }),
  createStripeWebhookRouter({
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    resendApiKey: process.env.RESEND_API_KEY,
    orderNotificationFromEmail: process.env.ORDER_NOTIFICATION_FROM_EMAIL,
    orderNotificationToEmail: process.env.ORDER_NOTIFICATION_TO_EMAIL,
    whatsappAccessToken: process.env.WHATSAPP_BUSINESS_ACCESS_TOKEN,
    whatsappPhoneNumberId: process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID,
    whatsappRecipient: process.env.WHATSAPP_BUSINESS_TO,
    whatsappTemplateName: process.env.WHATSAPP_BUSINESS_TEMPLATE_NAME,
    whatsappTemplateLanguageCode: process.env.WHATSAPP_BUSINESS_TEMPLATE_LANGUAGE || 'es_MX',
    whatsappApiVersion: process.env.WHATSAPP_BUSINESS_API_VERSION || 'v22.0'
  })
)

// Normal JSON parser for the rest of API routes.
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/mercadopago', paymentsRateLimiter, createMercadoPagoRouter({
  mpClient,
  mercadopagoToken,
  mpCheckoutMode
}))
app.use('/api/stripe', paymentsRateLimiter, createStripeRouter({ stripeSecretKey }))
app.use('/api/webhooks/mercadopago', webhooksRateLimiter, createMercadoPagoWebhookRouter({
  mpWebhookSecret: process.env.MP_WEBHOOK_SECRET,
  mercadopagoToken,
  whatsappAccessToken: process.env.WHATSAPP_BUSINESS_ACCESS_TOKEN,
  whatsappPhoneNumberId: process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID,
  whatsappRecipient: process.env.WHATSAPP_BUSINESS_TO,
  whatsappTemplateName: process.env.WHATSAPP_BUSINESS_TEMPLATE_NAME,
  whatsappTemplateLanguageCode: process.env.WHATSAPP_BUSINESS_TEMPLATE_LANGUAGE || 'es_MX',
  whatsappApiVersion: process.env.WHATSAPP_BUSINESS_API_VERSION || 'v22.0'
}))

app.listen(port, async () => {
  console.log(`Servidor MP activo en http://localhost:${port}`)
  // Optional context logging to verify token owner/test mode at startup.
  await logMercadoPagoCredentialContext()
})
