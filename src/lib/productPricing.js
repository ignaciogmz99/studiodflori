import { PROMO_PRODUCT_IDS } from '../constants/promoProducts'

export const HOT_SALE_DISCOUNT_RATE = 0.15
export const HOT_SALE_BADGE_LABEL = 'Hot Sale -15%'

const HOT_SALE_FACTOR = 1 - HOT_SALE_DISCOUNT_RATE

export function formatMxPrice(value) {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return ''
  }

  const fractionDigits = Number.isInteger(parsedValue) ? 0 : 2

  return parsedValue.toLocaleString('es-MX', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2
  })
}

export function isHotSaleEligibleProduct(productId) {
  return Boolean(productId) && !PROMO_PRODUCT_IDS.has(productId)
}

export function inferHotSaleOriginalPrice(discountedPrice) {
  const parsedPrice = Number(discountedPrice)

  if (!Number.isFinite(parsedPrice)) {
    return null
  }

  const precision = Number.isInteger(parsedPrice) ? 0 : 2
  const factor = 10 ** precision

  return Math.round((parsedPrice / HOT_SALE_FACTOR) * factor) / factor
}

export function resolveProductPriceDisplay(productId, price, fallbackOriginalPrice = null, originalPrice = null) {
  const parsedPrice = Number(price)
  const parsedOriginalPrice = Number(originalPrice)
  const parsedFallbackOriginalPrice = Number(fallbackOriginalPrice)
  const explicitOriginalPrice = Number.isFinite(parsedOriginalPrice) && parsedOriginalPrice > parsedPrice
    ? parsedOriginalPrice
    : null
  const fallbackDisplayPrice = Number.isFinite(parsedFallbackOriginalPrice) && parsedFallbackOriginalPrice > parsedPrice
    ? parsedFallbackOriginalPrice
    : null

  if (!Number.isFinite(parsedPrice)) {
    return {
      currentPrice: null,
      originalPrice: null,
      hasHotSale: false
    }
  }

  if (isHotSaleEligibleProduct(productId)) {
    return {
      currentPrice: parsedPrice,
      originalPrice: explicitOriginalPrice ?? inferHotSaleOriginalPrice(parsedPrice),
      hasHotSale: true
    }
  }

  return {
    currentPrice: parsedPrice,
    originalPrice: explicitOriginalPrice ?? fallbackDisplayPrice,
    hasHotSale: false
  }
}
