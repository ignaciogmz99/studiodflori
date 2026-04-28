// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetComprobantesSchemaSupportCache,
  upsertPaidOrder
} from './orderPersistenceService.js'

function createSupabaseFetchMock({ uniqueViolationOnInsert = false } = {}) {
  const state = {
    row: null,
    insertAttempts: 0
  }

  const fetchMock = vi.fn(async (url, options = {}) => {
    const parsedUrl = new URL(String(url))
    const method = String(options.method || 'GET').toUpperCase()

    if (!parsedUrl.pathname.includes('/rest/v1/comprobantes')) {
      throw new Error(`Fetch no mockeado: ${url}`)
    }

    if (method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => (state.row ? [state.row] : []),
        text: async () => JSON.stringify(state.row ? [state.row] : [])
      }
    }

    if (method === 'POST') {
      state.insertAttempts += 1
      const [incomingRow] = JSON.parse(options.body)
      state.row = {
        id: 'row-test-id',
        created_at: '2026-04-28T00:00:00.000Z',
        ...incomingRow
      }

      if (uniqueViolationOnInsert) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ code: '23505', message: 'duplicate key value violates unique constraint' }),
          text: async () => JSON.stringify({
            code: '23505',
            message: 'duplicate key value violates unique constraint'
          })
        }
      }

      return {
        ok: true,
        status: 201,
        json: async () => [state.row],
        text: async () => JSON.stringify([state.row])
      }
    }

    throw new Error(`Metodo no mockeado: ${method}`)
  })

  return { fetchMock, state }
}

function buildPaidOrderInput() {
  return {
    amountMxn: 1499,
    customerName: 'Ignacio Flores',
    customerPhone: '3312345678',
    metadata: {
      order_id: 'ord_idempotencia_12345',
      customer_name: 'Ignacio Flores',
      customer_phone: '3312345678',
      cart_items_summary: 'Ramo rosa x1',
      delivery_city: 'Guadalajara',
      delivery_address: 'Av. Siempre Viva 123',
      delivery_neighborhood: 'Centro',
      delivery_postal_code: '44100',
      delivery_date: '2026-05-10',
      delivery_time: '13:00'
    },
    paidAt: '2026-04-28T00:00:00.000Z',
    paymentId: 'pay_idempotencia_12345',
    orderId: 'ord_idempotencia_12345',
    source: 'mercadopago_webhook'
  }
}

describe('upsertPaidOrder idempotencia', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
    resetComprobantesSchemaSupportCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    resetComprobantesSchemaSupportCache()
  })

  it('inserta una sola vez y devuelve duplicado en reintentos del mismo pago', async () => {
    const { fetchMock, state } = createSupabaseFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    const input = buildPaidOrderInput()
    const firstResult = await upsertPaidOrder(input)
    const secondResult = await upsertPaidOrder(input)

    expect(firstResult.persisted).toBe(true)
    expect(firstResult.duplicate).toBe(false)
    expect(secondResult.persisted).toBe(true)
    expect(secondResult.duplicate).toBe(true)
    expect(secondResult.row.payment_id).toBe(input.paymentId)
    expect(state.insertAttempts).toBe(1)
  })

  it('recupera el registro existente si Supabase responde unique violation por una carrera', async () => {
    const { fetchMock, state } = createSupabaseFetchMock({ uniqueViolationOnInsert: true })
    vi.stubGlobal('fetch', fetchMock)

    const input = buildPaidOrderInput()
    const result = await upsertPaidOrder(input)

    expect(result.persisted).toBe(true)
    expect(result.duplicate).toBe(true)
    expect(result.race).toBe(true)
    expect(result.row.payment_id).toBe(input.paymentId)
    expect(state.insertAttempts).toBe(1)
  })
})
