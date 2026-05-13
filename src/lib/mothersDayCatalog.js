import { DIA_MADRES_FILTER_KEY, DIA_MADRES_IDS, ENABLE_MOTHERS_DAY_CATALOG } from '../constants/promoProducts'

const MOTHERS_DAY_MONTH = 5
const MOTHERS_DAY_SEASON_START = 1
const MOTHERS_DAY_LOCK_START = 7
const MOTHERS_DAY_SEASON_END = 10
const MOTHERS_DAY_SUNDAY_DELIVERY_DAY = 10
const DEFAULT_FLOWER_TYPE = 'all'

function normalizeDateValue(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const isoDateMatch = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0)
  }

  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

function getMonthAndDay(value) {
  const normalizedDate = normalizeDateValue(value)
  if (!normalizedDate) {
    return null
  }

  return {
    month: normalizedDate.getMonth() + 1,
    day: normalizedDate.getDate()
  }
}

export function isMothersDayCatalogSeason(value) {
  if (!ENABLE_MOTHERS_DAY_CATALOG) {
    return false
  }

  const parts = getMonthAndDay(value)
  if (!parts) {
    return false
  }

  return parts.month === MOTHERS_DAY_MONTH
    && parts.day >= MOTHERS_DAY_SEASON_START
    && parts.day <= MOTHERS_DAY_SEASON_END
}

export function isMothersDayCatalogLocked(value) {
  if (!ENABLE_MOTHERS_DAY_CATALOG) {
    return false
  }

  const parts = getMonthAndDay(value)
  if (!parts) {
    return false
  }

  return parts.month === MOTHERS_DAY_MONTH
    && parts.day >= MOTHERS_DAY_LOCK_START
    && parts.day <= MOTHERS_DAY_SEASON_END
}

export function allowsMothersDaySundayDelivery(value) {
  if (!ENABLE_MOTHERS_DAY_CATALOG) {
    return false
  }

  const parts = getMonthAndDay(value)
  if (!parts) {
    return false
  }

  return parts.month === MOTHERS_DAY_MONTH
    && parts.day === MOTHERS_DAY_SUNDAY_DELIVERY_DAY
}

export function isSundayDeliveryBlocked(value) {
  const normalizedDate = normalizeDateValue(value)
  if (!normalizedDate) {
    return false
  }

  return normalizedDate.getDay() === 0 && !allowsMothersDaySundayDelivery(normalizedDate)
}

export function isMothersDayProductId(productId) {
  if (!ENABLE_MOTHERS_DAY_CATALOG) {
    return false
  }

  return DIA_MADRES_IDS.has(String(productId || '').trim())
}

export function cartSupportsLockedMothersDayDates(items = []) {
  if (!ENABLE_MOTHERS_DAY_CATALOG) {
    return true
  }

  if (!Array.isArray(items) || items.length === 0) {
    return true
  }

  return items.every((item) => isMothersDayProductId(item?.id))
}

export function isLockedMothersDayDateBlockedForCart(value, items = []) {
  return isMothersDayCatalogLocked(value) && !cartSupportsLockedMothersDayDates(items)
}

export function resolveInitialFlowerType(value, fallback = DEFAULT_FLOWER_TYPE) {
  if (!ENABLE_MOTHERS_DAY_CATALOG) {
    return fallback
  }

  return isMothersDayCatalogSeason(value) ? DIA_MADRES_FILTER_KEY : fallback
}
