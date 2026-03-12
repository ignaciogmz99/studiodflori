import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMercadoPagoWebhookRouter } from '../routes/webhooks/mercadopagoWebhookRoutes.js'
import { resetComprobantesSchemaSupportCache } from '../services/orderPersistenceService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const receiptsDir = path.join(__dirname, '..', 'generated_receipts')

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload
    },
    async text() {
      return typeof payload === 'string' ? payload : JSON.stringify(payload)
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
    }
  }
}

async function invokeWebhook(router, req) {
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

function buildRequest({ webhookSecret, requestId, dataId, body, invalidSignature = false }) {
  const manifest = `id:${dataId};request-id:${requestId};ts:1700000000;`
  const signature = invalidSignature
    ? 'deadbeef'
    : crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex')

  return {
    method: 'POST',
    url: '/',
    query: {},
    body,
    headers: {
      'x-request-id': requestId,
      'x-signature': `ts=1700000000,v1=${signature}`
    }
  }
}

function createApprovedPayment() {
  return {
    id: '999000111',
    status: 'approved',
    transaction_amount: 1499,
    currency_id: 'MXN',
    date_created: '2026-03-12T16:00:00.000Z',
    date_approved: '2026-03-12T16:05:00.000Z',
    payer: {
      email: 'cliente@example.com'
    },
    metadata: {
      order_id: 'pedido_1234567890abcd',
      customer_name: 'Ignacio Flores',
      customer_phone: '3312345678',
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

function createFetchMock({
  failFirstWhatsapp = false,
  legacySchema = false,
  paymentStatus = 'approved',
  failSupabaseInsert = false
} = {}) {
  const state = {
    row: null,
    mpPaymentFetches: 0,
    whatsappSends: 0,
    whatsappFailures: 0
  }

  const approvedPayment = {
    ...createApprovedPayment(),
    status: paymentStatus
  }

  const fetchMock = async (url, options = {}) => {
    const normalizedUrl = String(url)

    if (normalizedUrl.startsWith('https://api.mercadopago.com/v1/payments/')) {
      state.mpPaymentFetches += 1
      return createJsonResponse(200, approvedPayment)
    }

    if (normalizedUrl.includes('/rest/v1/comprobantes')) {
      const method = String(options.method || 'GET').toUpperCase()
      const parsedUrl = new URL(normalizedUrl)
      const select = parsedUrl.searchParams.get('select') || ''

      if (method === 'GET') {
        if (legacySchema && select.includes('payment_id,order_id,source')) {
          return createJsonResponse(400, { message: 'column payment_id does not exist' })
        }
        if (legacySchema && select.includes('payment_id,pdf_path,pdf_generated_at,whatsapp_sent_at')) {
          return createJsonResponse(400, { message: 'column pdf_path does not exist' })
        }
        if (select.includes('payment_id,order_id,source')) {
          return createJsonResponse(200, state.row ? [state.row] : [])
        }
        if (select.includes('payment_id,pdf_path,pdf_generated_at,whatsapp_sent_at')) {
          return createJsonResponse(200, state.row ? [state.row] : [])
        }
        if (select.includes('payment_id,order_id,pdf_path,pdf_generated_at,whatsapp_sent_at')) {
          return createJsonResponse(200, state.row ? [state.row] : [])
        }
      }

      if (method === 'POST') {
        if (failSupabaseInsert) {
          return createJsonResponse(500, { message: 'supabase insert failure' })
        }
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
      if (failFirstWhatsapp && state.whatsappSends === 0 && state.whatsappFailures === 0) {
        state.whatsappFailures += 1
        return createJsonResponse(500, { error: 'simulated whatsapp failure' })
      }

      state.whatsappSends += 1
      return createJsonResponse(200, { messages: [{ id: 'wamid.mocked' }] })
    }

    throw new Error(`Fetch no mockeado: ${normalizedUrl}`)
  }

  return { fetchMock, state }
}

function createRouter(webhookSecret) {
  return createMercadoPagoWebhookRouter({
    mpWebhookSecret: webhookSecret,
    mercadopagoToken: 'APP_USR-mocked',
    whatsappAccessToken: 'wa-token',
    whatsappPhoneNumberId: '123456',
    whatsappRecipient: '523334913334',
    whatsappApiVersion: 'v22.0'
  })
}

async function cleanupReceipt() {
  const receiptPath = path.join(receiptsDir, 'comprobante-999000111.pdf')
  await fs.mkdir(receiptsDir, { recursive: true })
  await fs.rm(receiptPath, { force: true })
}

async function scenarioHappyPathAndDuplicate() {
  resetComprobantesSchemaSupportCache()
  await cleanupReceipt()
  const webhookSecret = 'webhook-secret'
  const { fetchMock, state } = createFetchMock()
  const originalFetch = global.fetch
  global.fetch = fetchMock

  try {
    const router = createRouter(webhookSecret)
    const firstResponse = await invokeWebhook(router, buildRequest({
      webhookSecret,
      requestId: 'req-1',
      dataId: '999000111',
      body: {
        action: 'payment.updated',
        type: 'payment',
        data: { id: '999000111' }
      }
    }))

    assert.equal(firstResponse.statusCode, 200)
    assert.deepEqual(firstResponse.body, { received: true })
    assert.equal(state.whatsappSends, 1)
    assert.ok(state.row?.pdf_generated_at)
    assert.ok(state.row?.whatsapp_sent_at)

    const secondResponse = await invokeWebhook(router, buildRequest({
      webhookSecret,
      requestId: 'req-2',
      dataId: '999000111',
      body: {
        action: 'payment.updated',
        resource: 'https://api.mercadopago.com/v1/payments/999000111'
      }
    }))

    assert.equal(secondResponse.statusCode, 200)
    assert.deepEqual(secondResponse.body, { received: true, duplicated: true })
    assert.equal(state.whatsappSends, 1)
    assert.equal(state.mpPaymentFetches, 2)
  } finally {
    global.fetch = originalFetch
  }
}

async function scenarioPartialWhatsappFailureThenRetry() {
  resetComprobantesSchemaSupportCache()
  await cleanupReceipt()
  const webhookSecret = 'webhook-secret'
  const { fetchMock, state } = createFetchMock({ failFirstWhatsapp: true })
  const originalFetch = global.fetch
  global.fetch = fetchMock

  try {
    const router = createRouter(webhookSecret)
    const firstResponse = await invokeWebhook(router, buildRequest({
      webhookSecret,
      requestId: 'req-3',
      dataId: '999000111',
      body: {
        topic: 'payment',
        data: { id: '999000111' }
      }
    }))

    assert.equal(firstResponse.statusCode, 200)
    assert.deepEqual(firstResponse.body, { received: true, processedWithWarnings: true })
    assert.ok(state.row?.pdf_generated_at)
    assert.equal(state.row?.whatsapp_sent_at, undefined)
    assert.equal(state.whatsappFailures, 1)
    assert.equal(state.whatsappSends, 0)

    const secondResponse = await invokeWebhook(router, buildRequest({
      webhookSecret,
      requestId: 'req-4',
      dataId: '999000111',
      body: {
        topic: 'payment',
        data: { id: '999000111' }
      }
    }))

    assert.equal(secondResponse.statusCode, 200)
    assert.deepEqual(secondResponse.body, { received: true })
    assert.equal(state.whatsappSends, 1)
    assert.ok(state.row?.whatsapp_sent_at)
  } finally {
    global.fetch = originalFetch
  }
}

async function scenarioInvalidSignature() {
  resetComprobantesSchemaSupportCache()
  const webhookSecret = 'webhook-secret'
  const { fetchMock, state } = createFetchMock()
  const originalFetch = global.fetch
  global.fetch = fetchMock

  try {
    const router = createRouter(webhookSecret)
    const response = await invokeWebhook(router, buildRequest({
      webhookSecret,
      requestId: 'req-5',
      dataId: '999000111',
      invalidSignature: true,
      body: {
        topic: 'payment',
        data: { id: '999000111' }
      }
    }))

    assert.equal(response.statusCode, 400)
    assert.match(String(response.body?.error || ''), /Firma de Mercado Pago invalida/)
    assert.equal(state.mpPaymentFetches, 0)
    assert.equal(state.whatsappSends, 0)
  } finally {
    global.fetch = originalFetch
  }
}

async function scenarioLegacySchemaNoHardDedupe() {
  resetComprobantesSchemaSupportCache()
  await cleanupReceipt()
  const webhookSecret = 'webhook-secret'
  const { fetchMock, state } = createFetchMock({ legacySchema: true })
  const originalFetch = global.fetch
  global.fetch = fetchMock

  try {
    const router = createRouter(webhookSecret)
    const response = await invokeWebhook(router, buildRequest({
      webhookSecret,
      requestId: 'req-6',
      dataId: '999000111',
      body: {
        topic: 'payment',
        data: { id: '999000111' }
      }
    }))

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, { received: true })
    assert.equal(state.whatsappSends, 1)
    assert.equal(state.row?.payment_id, undefined)
  } finally {
    global.fetch = originalFetch
  }
}

async function scenarioPendingPaymentDoesNothing() {
  resetComprobantesSchemaSupportCache()
  await cleanupReceipt()
  const webhookSecret = 'webhook-secret'
  const { fetchMock, state } = createFetchMock({ paymentStatus: 'pending' })
  const originalFetch = global.fetch
  global.fetch = fetchMock

  try {
    const router = createRouter(webhookSecret)
    const response = await invokeWebhook(router, buildRequest({
      webhookSecret,
      requestId: 'req-7',
      dataId: '999000111',
      body: {
        action: 'payment.updated',
        data: { id: '999000111' }
      }
    }))

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, { received: true })
    assert.equal(state.mpPaymentFetches, 1)
    assert.equal(state.whatsappSends, 0)
    assert.equal(state.row, null)
  } finally {
    global.fetch = originalFetch
  }
}

async function scenarioRejectedPaymentDoesNothing() {
  resetComprobantesSchemaSupportCache()
  await cleanupReceipt()
  const webhookSecret = 'webhook-secret'
  const { fetchMock, state } = createFetchMock({ paymentStatus: 'rejected' })
  const originalFetch = global.fetch
  global.fetch = fetchMock

  try {
    const router = createRouter(webhookSecret)
    const response = await invokeWebhook(router, buildRequest({
      webhookSecret,
      requestId: 'req-8',
      dataId: '999000111',
      body: {
        topic: 'payment',
        data: { id: '999000111' }
      }
    }))

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, { received: true })
    assert.equal(state.mpPaymentFetches, 1)
    assert.equal(state.whatsappSends, 0)
    assert.equal(state.row, null)
  } finally {
    global.fetch = originalFetch
  }
}

async function scenarioSupabaseFailureReturns500() {
  resetComprobantesSchemaSupportCache()
  await cleanupReceipt()
  const webhookSecret = 'webhook-secret'
  const { fetchMock, state } = createFetchMock({ failSupabaseInsert: true })
  const originalFetch = global.fetch
  global.fetch = fetchMock

  try {
    const router = createRouter(webhookSecret)
    const response = await invokeWebhook(router, buildRequest({
      webhookSecret,
      requestId: 'req-9',
      dataId: '999000111',
      body: {
        topic: 'payment',
        data: { id: '999000111' }
      }
    }))

    assert.equal(response.statusCode, 500)
    assert.match(String(response.body?.error || ''), /Fallo post-pago|No se pudo guardar comprobante/)
    assert.equal(state.mpPaymentFetches, 1)
    assert.equal(state.whatsappSends, 0)
    assert.equal(state.row, null)
  } finally {
    global.fetch = originalFetch
  }
}

async function scenarioMissingMercadoPagoTokenReturns500() {
  resetComprobantesSchemaSupportCache()
  const webhookSecret = 'webhook-secret'
  const originalFetch = global.fetch
  global.fetch = async () => {
    throw new Error('No deberia llamar fetch sin token de MP')
  }

  try {
    const router = createMercadoPagoWebhookRouter({
      mpWebhookSecret: webhookSecret,
      mercadopagoToken: '',
      whatsappAccessToken: 'wa-token',
      whatsappPhoneNumberId: '123456',
      whatsappRecipient: '523334913334',
      whatsappApiVersion: 'v22.0'
    })

    const response = await invokeWebhook(router, buildRequest({
      webhookSecret,
      requestId: 'req-10',
      dataId: '999000111',
      body: {
        topic: 'payment',
        data: { id: '999000111' }
      }
    }))

    assert.equal(response.statusCode, 500)
    assert.match(String(response.body?.error || ''), /Falta MERCADO_PAGO_ACCESS_TOKEN/)
  } finally {
    global.fetch = originalFetch
  }
}

async function scenarioQueryStringTopicAndId() {
  resetComprobantesSchemaSupportCache()
  await cleanupReceipt()
  const webhookSecret = 'webhook-secret'
  const { fetchMock, state } = createFetchMock()
  const originalFetch = global.fetch
  global.fetch = fetchMock

  try {
    const router = createRouter(webhookSecret)
    const response = await invokeWebhook(router, {
      ...buildRequest({
        webhookSecret,
        requestId: 'req-11',
        dataId: '999000111',
        body: {}
      }),
      query: {
        topic: 'payment',
        id: '999000111'
      }
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, { received: true })
    assert.equal(state.mpPaymentFetches, 1)
    assert.equal(state.whatsappSends, 1)
  } finally {
    global.fetch = originalFetch
  }
}

async function runSimulation() {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'

  await scenarioHappyPathAndDuplicate()
  await scenarioPartialWhatsappFailureThenRetry()
  await scenarioInvalidSignature()
  await scenarioLegacySchemaNoHardDedupe()
  await scenarioPendingPaymentDoesNothing()
  await scenarioRejectedPaymentDoesNothing()
  await scenarioSupabaseFailureReturns500()
  await scenarioMissingMercadoPagoTokenReturns500()
  await scenarioQueryStringTopicAndId()

  const generatedFiles = await fs.readdir(receiptsDir)
  assert.ok(generatedFiles.some((file) => file.includes('comprobante-999000111.pdf')))

  console.log('Simulaciones OK')
  console.log('Cobertura ejecutada: aprobado, duplicado, reintento parcial de WhatsApp, firma invalida, esquema legacy, pending, rejected, falla de Supabase, falta de token MP, query params')
}

await runSimulation()
