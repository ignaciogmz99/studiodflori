import { describe, expect, it } from 'vitest'
import {
  formatMxPrice,
  inferHotSaleOriginalPrice,
  isHotSaleEligibleProduct,
  resolveProductPriceDisplay
} from './productPricing'

describe('productPricing', () => {
  it('excluye las promociones especiales de 595 del Hot Sale', () => {
    expect(isHotSaleEligibleProduct('Bouquet')).toBe(false)
    expect(isHotSaleEligibleProduct('Kira')).toBe(true)
  })

  it('reconstruye el precio original del Hot Sale', () => {
    expect(inferHotSaleOriginalPrice(850)).toBe(1000)
    expect(inferHotSaleOriginalPrice(849)).toBe(999)
  })

  it('usa el fallback original para productos fuera del Hot Sale', () => {
    expect(resolveProductPriceDisplay('Bouquet', 595, 650)).toEqual({
      currentPrice: 595,
      originalPrice: 650,
      hasHotSale: false
    })
  })

  it('marca como Hot Sale los productos elegibles', () => {
    expect(resolveProductPriceDisplay('Kira', 977)).toEqual({
      currentPrice: 977,
      originalPrice: 1149,
      hasHotSale: true
    })
  })

  it('prioriza el precio original real cuando llega desde Supabase', () => {
    expect(resolveProductPriceDisplay('Kira', 977, null, 1150)).toEqual({
      currentPrice: 977,
      originalPrice: 1150,
      hasHotSale: true
    })
  })

  it('formatea precios en MXN sin ruido visual', () => {
    expect(formatMxPrice(850)).toBe('850')
    expect(formatMxPrice(849.15)).toBe('849.15')
  })
})
