import { describe, expect, it } from 'vitest'
import { formatMxPrice } from './productPricing'

describe('productPricing', () => {
  it('formatea precios en MXN sin ruido visual', () => {
    expect(formatMxPrice(850)).toBe('850')
    expect(formatMxPrice(849.15)).toBe('849.15')
  })

  it('regresa cadena vacia cuando el precio no es valido', () => {
    expect(formatMxPrice(null)).toBe('')
    expect(formatMxPrice('no-number')).toBe('')
  })
})
