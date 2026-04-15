// @vitest-environment node
/* global Buffer */
import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import {
  parseStripeSignatureHeader,
  verifyStripeSignature,
  formatAmount
} from './stripeWebhookRoutes.js'

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
