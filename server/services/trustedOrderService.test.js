// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateOrderId, buildOrderFingerprint, buildTrustedOrderFromClientItems } from './trustedOrderService.js'

// ── validateOrderId ───────────────────────────────────────────────────────────

describe('validateOrderId', () => {
  it('acepta un ID valido con letras, numeros y guiones', () => {
    expect(validateOrderId('ord_1234567890abcdef')).toBe('ord_1234567890abcdef')
  })

  it('acepta el formato generado por el frontend (ord_timestamp_random)', () => {
    const frontendId = `ord_${Date.now()}_abc123xyz9`
    expect(() => validateOrderId(frontendId)).not.toThrow()
  })

  it('rechaza IDs de menos de 16 caracteres', () => {
    expect(() => validateOrderId('ord_corto')).toThrow('invalido')
  })

  it('rechaza IDs de mas de 80 caracteres', () => {
    const longId = 'a'.repeat(81)
    expect(() => validateOrderId(longId)).toThrow('invalido')
  })

  it('rechaza IDs con espacios', () => {
    expect(() => validateOrderId('ord 1234567890abcd')).toThrow('invalido')
  })

  it('rechaza IDs con caracteres especiales', () => {
    expect(() => validateOrderId('ord_1234567890!@#$')).toThrow('invalido')
  })

  it('rechaza string vacio', () => {
    expect(() => validateOrderId('')).toThrow('invalido')
  })

  it('rechaza null', () => {
    expect(() => validateOrderId(null)).toThrow('invalido')
  })

  it('recorta espacios antes de validar', () => {
    const validId = 'ord_1234567890abcdef'
    expect(validateOrderId(`  ${validId}  `)).toBe(validId)
  })
})

// ── buildOrderFingerprint ─────────────────────────────────────────────────────

describe('buildOrderFingerprint', () => {
  const items = [
    { id: 'flor_001', quantity: 2, unitPrice: 595.00 },
    { id: 'flor_002', quantity: 1, unitPrice: 1350.00 }
  ]

  it('produce el mismo fingerprint para los mismos inputs', () => {
    const fp1 = buildOrderFingerprint({ orderId: 'ord_test_1234567890', items })
    const fp2 = buildOrderFingerprint({ orderId: 'ord_test_1234567890', items })
    expect(fp1).toBe(fp2)
  })

  it('produce fingerprints diferentes para ordenes distintas', () => {
    const fp1 = buildOrderFingerprint({ orderId: 'ord_aaaaaaaaaaaa1111', items })
    const fp2 = buildOrderFingerprint({ orderId: 'ord_bbbbbbbbbbbb2222', items })
    expect(fp1).not.toBe(fp2)
  })

  it('produce fingerprints diferentes si cambia la cantidad', () => {
    const items2 = [{ ...items[0], quantity: 3 }, items[1]]
    const fp1 = buildOrderFingerprint({ orderId: 'ord_test_1234567890', items })
    const fp2 = buildOrderFingerprint({ orderId: 'ord_test_1234567890', items: items2 })
    expect(fp1).not.toBe(fp2)
  })

  it('produce fingerprints diferentes si cambia el precio', () => {
    const itemsDiffPrice = [{ ...items[0], unitPrice: 600.00 }, items[1]]
    const fp1 = buildOrderFingerprint({ orderId: 'ord_test_1234567890', items })
    const fp2 = buildOrderFingerprint({ orderId: 'ord_test_1234567890', items: itemsDiffPrice })
    expect(fp1).not.toBe(fp2)
  })

  it('el orden de los items no afecta el fingerprint (se ordenan internamente)', () => {
    const itemsReversed = [...items].reverse()
    const fp1 = buildOrderFingerprint({ orderId: 'ord_test_1234567890', items })
    const fp2 = buildOrderFingerprint({ orderId: 'ord_test_1234567890', items: itemsReversed })
    expect(fp1).toBe(fp2)
  })
})

// ── buildTrustedOrderFromClientItems ─────────────────────────────────────────

describe('buildTrustedOrderFromClientItems', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('calcula monto correcto desde precios de Supabase', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'flor_001', precio: 595, activo: true },
        { id: 'flor_002', precio: 1350, activo: true }
      ]
    }))

    const result = await buildTrustedOrderFromClientItems([
      { id: 'flor_001', quantity: 2 },
      { id: 'flor_002', quantity: 1 }
    ])

    expect(result.amount).toBe(2540.00) // 595*2 + 1350*1
    expect(result.items).toHaveLength(2)
    expect(result.items[0].unitPrice).toBe(595)
    expect(result.items[1].unitPrice).toBe(1350)
  })

  it('ignora el precio enviado por el cliente — siempre usa Supabase', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'flor_001', precio: 595, activo: true }]
    }))

    // El cliente intenta pagar 1 MXN por un producto de 595
    const result = await buildTrustedOrderFromClientItems([
      { id: 'flor_001', quantity: 1, price: 1 }
    ])

    expect(result.amount).toBe(595) // precio real de Supabase, no el del cliente
  })

  it('lanza error si un producto no existe en Supabase', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [] // producto no encontrado
    }))

    await expect(
      buildTrustedOrderFromClientItems([{ id: 'flor_inexistente', quantity: 1 }])
    ).rejects.toThrow('invalido o inactivo')
  })

  it('lanza error si un producto esta inactivo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'flor_001', precio: 595, activo: false }]
    }))

    await expect(
      buildTrustedOrderFromClientItems([{ id: 'flor_001', quantity: 1 }])
    ).rejects.toThrow('invalido o inactivo')
  })

  it('lanza error si el carrito esta vacio', async () => {
    await expect(buildTrustedOrderFromClientItems([])).rejects.toThrow('No hay productos')
  })

  it('lanza error si hay mas de 50 productos distintos', async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ id: `flor_${i}`, quantity: 1 }))
    await expect(buildTrustedOrderFromClientItems(items)).rejects.toThrow('50')
  })

  it('clampea cantidad a 20 si el cliente manda mas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'flor_001', precio: 100, activo: true }]
    }))

    const result = await buildTrustedOrderFromClientItems([
      { id: 'flor_001', quantity: 999 }
    ])

    expect(result.items[0].quantity).toBe(20) // MAX_QTY_PER_ITEM
    expect(result.amount).toBe(2000) // 100 * 20
  })

  it('valida el curso desde la tabla Curso cuando no esta en productos', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ precio: 3000, activo: true, nombre: 'Curso intensivo floral' }]
      }))

    const result = await buildTrustedOrderFromClientItems([
      { id: 'Curso', quantity: 1, price: 1 }
    ])

    expect(result.amount).toBe(3000)
    expect(result.items[0]).toMatchObject({
      id: 'Curso',
      name: 'Curso intensivo floral',
      quantity: 1,
      unitPrice: 3000
    })
  })
})
