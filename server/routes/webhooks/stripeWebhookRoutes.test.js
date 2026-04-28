// @vitest-environment node
/* global Buffer */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createStripeWebhookRouter,
  parseStripeSignatureHeader,
  verifyStripeSignature,
  formatAmount
} from './stripeWebhookRoutes.js'
import { resetComprobantesSchemaSupportCache } from '../../services/orderPersistenceService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const receiptsDir = path.join(__dirname, '..', '..', 'generated_receipts')

// ── parseStripeSignatureHeader ────────────────────────────────────────────────

describe('parseStripeSignatureHeader', () => {
  it('parsea timestamp y firma validos', () => {
    const result = parseStripeSignatureHeader('t=1234567890,v1=abc123def456')
    expect(result.timestamp).toBe(1234567890)
    expect(result.signatures).toEqual(['abc123def456'])
  })

  it('parsea multiples firmas v1', () => {
    const result = parseStripeSignatureHeader('t=111,v1=aaa,v1=bbb')
    expect(result.timestamp).toBe(111)
    expect(result.signatures).toEqual(['aaa', 'bbb'])
  })

  it('ignora versiones desconocidas (v0, v2)', () => {
    const result = parseStripeSignatureHeader('t=999,v0=old,v1=good,v2=future')
    expect(result.signatures).toEqual(['good'])
  })

  it('devuelve timestamp null y firmas vacias cuando el header es nulo', () => {
    const result = parseStripeSignatureHeader(null)
    expect(result.timestamp).toBeNull()
    expect(result.signatures).toEqual([])
  })

  it('devuelve timestamp null y firmas vacias para string vacio', () => {
    const result = parseStripeSignatureHeader('')
    expect(result.timestamp).toBeNull()
    expect(result.signatures).toEqual([])
  })

  it('ignora segmentos malformados sin signo igual', () => {
    const result = parseStripeSignatureHeader('t=100,malformado,v1=ok')
    expect(result.timestamp).toBe(100)
    expect(result.signatures).toEqual(['ok'])
  })
})

// ── verifyStripeSignature ─────────────────────────────────────────────────────

function buildValidSignatureHeader({ secret, rawBody, timestamp }) {
  const payload = `${timestamp}.${rawBody}`
  const sig = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
  return `t=${timestamp},v1=${sig}`
}

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test_secret_key_12345'
  const rawBody = Buffer.from('{"id":"evt_test","type":"payment_intent.succeeded"}')
  const nowSeconds = () => Math.floor(Date.now() / 1000)

  it('acepta una firma valida dentro de la ventana de tolerancia', () => {
    const ts = nowSeconds()
    const header = buildValidSignatureHeader({ secret, rawBody: rawBody.toString('utf8'), timestamp: ts })
    expect(() => verifyStripeSignature({ rawBody, signatureHeader: header, webhookSecret: secret })).not.toThrow()
  })

  it('rechaza cuando falta el webhook secret', () => {
    const ts = nowSeconds()
    const header = buildValidSignatureHeader({ secret, rawBody: rawBody.toString('utf8'), timestamp: ts })
    expect(() => verifyStripeSignature({ rawBody, signatureHeader: header, webhookSecret: '' }))
      .toThrow('Falta STRIPE_WEBHOOK_SECRET')
  })

  it('rechaza un timestamp expirado (mas de 300s de diferencia)', () => {
    const expiredTs = nowSeconds() - 400
    const header = buildValidSignatureHeader({ secret, rawBody: rawBody.toString('utf8'), timestamp: expiredTs })
    expect(() => verifyStripeSignature({ rawBody, signatureHeader: header, webhookSecret: secret }))
      .toThrow('expirada')
  })

  it('rechaza una firma incorrecta', () => {
    const ts = nowSeconds()
    const header = `t=${ts},v1=0000000000000000000000000000000000000000000000000000000000000000`
    expect(() => verifyStripeSignature({ rawBody, signatureHeader: header, webhookSecret: secret }))
      .toThrow('invalida')
  })

  it('rechaza header de firma vacio', () => {
    expect(() => verifyStripeSignature({ rawBody, signatureHeader: '', webhookSecret: secret }))
      .toThrow('invalido')
  })

  it('acepta tolerancia personalizada', () => {
    const ts = nowSeconds() - 60
    const header = buildValidSignatureHeader({ secret, rawBody: rawBody.toString('utf8'), timestamp: ts })
    // 30s tolerance: 60s de diferencia debe fallar
    expect(() => verifyStripeSignature({ rawBody, signatureHeader: header, webhookSecret: secret, toleranceSeconds: 30 }))
      .toThrow('expirada')
  })
})

// ── formatAmount ──────────────────────────────────────────────────────────────

describe('formatAmount', () => {
  it('convierte centavos a pesos y agrega moneda en mayusculas', () => {
    expect(formatAmount(150000, 'mxn')).toBe('1500.00 MXN')
  })

  it('maneja montos con decimales', () => {
    expect(formatAmount(9999, 'mxn')).toBe('99.99 MXN')
  })

  it('usa MXN como moneda por defecto', () => {
    expect(formatAmount(500, undefined)).toBe('5.00 MXN')
  })

  it('devuelve 0.00 sin moneda para valores no numericos', () => {
    // Number('invalido') = NaN → !isFinite → early return sin currency
    expect(formatAmount('invalido', 'mxn')).toBe('0.00')
  })

  it('devuelve 0.00 para null', () => {
    expect(formatAmount(null, 'mxn')).toBe('0.00 MXN')
  })
})

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload
    },
    async text() {
      return typeof payload === 'string' ? payload : JSON.stringify(payload)
    },
    async arrayBuffer() {
      return Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)).buffer
    }
  }
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    onEnd: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      if (typeof this.onEnd === 'function') {
        this.onEnd()
      }
      return this
    },
    send(payload) {
      this.body = payload
      if (typeof this.onEnd === 'function') {
        this.onEnd()
      }
      return this
    },
    setHeader() {
      return this
    }
  }
}

async function invokeStripeWebhook(router, req) {
  const res = createMockResponse()
  await new Promise((resolve, reject) => {
    res.onEnd = resolve
    router.handle(req, res, (error) => {
      if (error) {
        reject(error)
      }
    })
  })
  return res
}

function createStripePaymentIntent() {
  return {
    id: 'pi_stripe_idempotencia_12345',
    object: 'payment_intent',
    status: 'succeeded',
    amount: 149900,
    amount_received: 149900,
    currency: 'mxn',
    receipt_email: 'cliente@example.com',
    metadata: {
      order_id: 'ord_stripe_idempotencia_12345',
      customer_name: 'Ignacio Flores',
      customer_phone: '3312345678',
      customer_email: 'cliente@example.com',
      fulfillment_type: 'delivery',
      recipient_name: 'Ignacio Flores',
      delivery_city: 'Guadalajara',
      delivery_address: 'Av. Siempre Viva 123',
      delivery_neighborhood: 'Centro',
      delivery_postal_code: '44100',
      flower_message: 'Feliz aniversario',
      delivery_notes: 'Tocar timbre',
      delivery_date: '2026-03-20',
      delivery_time: '13:00',
      cart_items_summary: 'Ramo rosa x1 | Tulipanes x2'
    }
  }
}

function createStripeWebhookEvent({ eventId = 'evt_stripe_idempotencia_12345' } = {}) {
  return {
    id: eventId,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: createStripePaymentIntent()
    }
  }
}

function buildStripeWebhookRequest({ webhookSecret, event }) {
  const rawBody = Buffer.from(JSON.stringify(event))
  const timestamp = Math.floor(Date.now() / 1000)
  return {
    method: 'POST',
    url: '/',
    query: {},
    body: rawBody,
    headers: {
      'stripe-signature': buildValidSignatureHeader({
        secret: webhookSecret,
        rawBody: rawBody.toString('utf8'),
        timestamp
      })
    }
  }
}

function createStripePostPaymentFetchMock() {
  const state = {
    row: null,
    supabaseInserts: 0,
    whatsappSends: 0
  }

  const fetchMock = vi.fn(async (url, options = {}) => {
    const normalizedUrl = String(url)

    if (normalizedUrl.includes('/rest/v1/comprobantes')) {
      const method = String(options.method || 'GET').toUpperCase()

      if (method === 'GET') {
        return createJsonResponse(200, state.row ? [state.row] : [])
      }

      if (method === 'POST') {
        state.supabaseInserts += 1
        const [incomingRow] = JSON.parse(options.body)
        state.row = {
          ...(state.row || {}),
          ...incomingRow
        }
        return createJsonResponse(201, [state.row])
      }

      if (method === 'PATCH') {
        const patch = JSON.parse(options.body)
        state.row = {
          ...(state.row || {}),
          ...patch
        }
        return createJsonResponse(200, [state.row])
      }
    }

    if (normalizedUrl.includes('graph.facebook.com')) {
      state.whatsappSends += 1
      return createJsonResponse(200, { messages: [{ id: 'wamid.stripe.mocked' }] })
    }

    throw new Error(`Fetch no mockeado: ${normalizedUrl}`)
  })

  return { fetchMock, state }
}

async function cleanupStripeReceipt() {
  await fs.rm(
    path.join(receiptsDir, 'comprobante-stripe-pi_stripe_idempotencia_12345.pdf'),
    { force: true }
  )
}

describe('Stripe webhook idempotencia de post-pago', () => {
  const webhookSecret = 'whsec_test_secret_key_12345'
  const envKeys = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_RECEIPTS_BUCKET',
    'RECEIPTS_STORAGE_ENDPOINT',
    'RECEIPTS_STORAGE_BUCKET',
    'RECEIPTS_STORAGE_ACCESS_KEY_ID',
    'RECEIPTS_STORAGE_SECRET_ACCESS_KEY',
    'S3_ENDPOINT_URL',
    'S3_BUCKET',
    'AWS_ENDPOINT_URL_S3',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY'
  ]
  let originalEnv = {}

  beforeEach(async () => {
    originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
    for (const key of envKeys.slice(2)) {
      delete process.env[key]
    }
    resetComprobantesSchemaSupportCache()
    await cleanupStripeReceipt()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key]
      }
    }
    resetComprobantesSchemaSupportCache()
    await cleanupStripeReceipt()
  })

  it('no duplica fila ni WhatsApp cuando Stripe reenvia el mismo evento', async () => {
    const { fetchMock, state } = createStripePostPaymentFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    const router = createStripeWebhookRouter({
      stripeWebhookSecret: webhookSecret,
      whatsappAccessToken: 'wa-token',
      whatsappPhoneNumberId: '123456',
      whatsappRecipient: '523334913334',
      whatsappApiVersion: 'v22.0'
    })
    const event = createStripeWebhookEvent()

    const firstResponse = await invokeStripeWebhook(router, buildStripeWebhookRequest({
      webhookSecret,
      event
    }))
    const secondResponse = await invokeStripeWebhook(router, buildStripeWebhookRequest({
      webhookSecret,
      event
    }))

    expect(firstResponse.statusCode).toBe(200)
    expect(firstResponse.body).toEqual({ received: true })
    expect(secondResponse.statusCode).toBe(200)
    expect(secondResponse.body).toEqual({ received: true, duplicated: true })
    expect(state.supabaseInserts).toBe(1)
    expect(state.whatsappSends).toBe(1)
    expect(state.row.pdf_generated_at).toBeTruthy()
    expect(state.row.whatsapp_sent_at).toBeTruthy()
  })
})
