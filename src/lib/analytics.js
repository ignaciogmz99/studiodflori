const GOOGLE_TAG_ID = String(import.meta.env.VITE_GOOGLE_TAG_ID || '').trim()
const GA_MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim()
const GOOGLE_ADS_ID = String(import.meta.env.VITE_GOOGLE_ADS_ID || '').trim()
const GOOGLE_ADS_PURCHASE_LABEL = String(import.meta.env.VITE_GOOGLE_ADS_PURCHASE_LABEL || '').trim()
const TRACKED_EVENTS_STORAGE_KEY = 'studiodflori_tracked_events_v1'

function getActiveTagId() {
  return GOOGLE_TAG_ID || GA_MEASUREMENT_ID || GOOGLE_ADS_ID
}

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function roundMoney(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : 0
}

function normalizeText(value, fallback = '') {
  return String(value || '').trim() || fallback
}

function normalizeItems(items = []) {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      item_id: normalizeText(item.item_id || item.id, 'sin_id'),
      item_name: normalizeText(item.item_name || item.name, 'Producto'),
      item_category: normalizeText(item.item_category || item.itemType || item.fulfillmentType, 'product'),
      price: roundMoney(item.price),
      quantity: Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
        ? Number(item.quantity)
        : 1
    }))
}

function buildItemsFingerprint(items = []) {
  return normalizeItems(items)
    .map((item) => `${item.item_id}:${item.price}:${item.quantity}`)
    .sort()
    .join('|')
}

function readTrackedEvents() {
  if (!isBrowser()) {
    return {}
  }

  try {
    const rawValue = window.sessionStorage.getItem(TRACKED_EVENTS_STORAGE_KEY)
    if (!rawValue) {
      return {}
    }

    const parsedValue = JSON.parse(rawValue)
    return parsedValue && typeof parsedValue === 'object' ? parsedValue : {}
  } catch {
    return {}
  }
}

function saveTrackedEvents(eventMap) {
  if (!isBrowser()) {
    return
  }

  try {
    window.sessionStorage.setItem(TRACKED_EVENTS_STORAGE_KEY, JSON.stringify(eventMap))
  } catch {
    // Ignore storage errors to keep checkout non-blocking.
  }
}

function hasTrackedEvent(eventKey) {
  if (!eventKey) {
    return false
  }

  const trackedEvents = readTrackedEvents()
  return Boolean(trackedEvents[eventKey])
}

function markTrackedEvent(eventKey) {
  if (!eventKey) {
    return
  }

  const trackedEvents = readTrackedEvents()
  trackedEvents[eventKey] = Date.now()
  saveTrackedEvents(trackedEvents)
}

function getGtag() {
  if (!isBrowser() || typeof window.gtag !== 'function') {
    return null
  }

  return window.gtag
}

function ensureDataLayer() {
  if (!isBrowser()) {
    return
  }

  window.dataLayer = window.dataLayer || []
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments)
    }
  }
}

export function isGoogleTagEnabled() {
  return Boolean(getActiveTagId())
}

export function initializeGoogleTag() {
  if (!isBrowser() || !isGoogleTagEnabled() || window.__studiodfloriGoogleTagInitialized) {
    return
  }

  ensureDataLayer()

  const activeTagId = getActiveTagId()
  const scriptSrc = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(activeTagId)}`

  if (!document.querySelector(`script[src="${scriptSrc}"]`)) {
    const script = document.createElement('script')
    script.async = true
    script.src = scriptSrc
    document.head.appendChild(script)
  }

  window.gtag('js', new Date())

  const configuredIds = new Set()
  const tagIds = [GA_MEASUREMENT_ID, GOOGLE_ADS_ID].filter(Boolean)
  if (tagIds.length === 0 && activeTagId) {
    tagIds.push(activeTagId)
  }

  tagIds.forEach((tagId) => {
    if (configuredIds.has(tagId)) {
      return
    }

    window.gtag('config', tagId, {
      send_page_view: false
    })
    configuredIds.add(tagId)
  })

  window.__studiodfloriGoogleTagInitialized = true
}

export function trackEvent(eventName, params = {}) {
  if (!isGoogleTagEnabled()) {
    return false
  }

  initializeGoogleTag()

  const gtag = getGtag()
  if (!gtag) {
    return false
  }

  gtag('event', eventName, params)
  return true
}

export function trackEventOnce(eventKey, eventName, params = {}) {
  if (!eventKey || hasTrackedEvent(eventKey)) {
    return false
  }

  const tracked = trackEvent(eventName, params)
  if (tracked) {
    markTrackedEvent(eventKey)
  }

  return tracked
}

export function trackPageView({ pagePath, pageTitle } = {}) {
  const normalizedPagePath = normalizeText(pagePath, '/')

  return trackEvent('page_view', {
    page_path: normalizedPagePath,
    page_title: normalizeText(pageTitle, document.title || normalizedPagePath)
  })
}

export function trackViewItem(product = {}) {
  const itemId = normalizeText(product.id)
  if (!itemId) {
    return false
  }

  return trackEvent('view_item', {
    currency: 'MXN',
    value: roundMoney(product.price),
    items: normalizeItems([{ ...product, quantity: 1 }])
  })
}

export function trackAddToCart(product = {}) {
  const itemId = normalizeText(product.id)
  if (!itemId) {
    return false
  }

  return trackEvent('add_to_cart', {
    currency: 'MXN',
    value: roundMoney(product.price),
    items: normalizeItems([{ ...product, quantity: 1 }])
  })
}

export function trackBeginCheckout({ items = [], value = 0 } = {}) {
  const normalizedItems = normalizeItems(items)
  if (normalizedItems.length === 0) {
    return false
  }

  return trackEventOnce(
    `begin_checkout:${buildItemsFingerprint(normalizedItems)}:${roundMoney(value)}`,
    'begin_checkout',
    {
      currency: 'MXN',
      value: roundMoney(value),
      items: normalizedItems
    }
  )
}

export function trackAddShippingInfo({
  items = [],
  value = 0,
  fulfillmentType = 'delivery'
} = {}) {
  const normalizedItems = normalizeItems(items)
  if (normalizedItems.length === 0) {
    return false
  }

  return trackEventOnce(
    `add_shipping_info:${buildItemsFingerprint(normalizedItems)}:${roundMoney(value)}:${normalizeText(fulfillmentType, 'delivery')}`,
    'add_shipping_info',
    {
      currency: 'MXN',
      value: roundMoney(value),
      shipping_tier: normalizeText(fulfillmentType, 'delivery'),
      items: normalizedItems
    }
  )
}

export function trackPurchase({
  orderId,
  paymentId,
  provider,
  amount,
  currency = 'MXN',
  items = [],
  fulfillmentType = 'delivery'
} = {}) {
  const transactionId = normalizeText(orderId || paymentId)
  const normalizedItems = normalizeItems(items)

  if (!transactionId || normalizedItems.length === 0) {
    return false
  }

  const purchaseTracked = trackEventOnce(
    `purchase:${transactionId}`,
    'purchase',
    {
      transaction_id: transactionId,
      currency: normalizeText(currency, 'MXN'),
      value: roundMoney(amount),
      payment_type: normalizeText(provider, 'card'),
      shipping_tier: normalizeText(fulfillmentType, 'delivery'),
      items: normalizedItems
    }
  )

  if (purchaseTracked && GOOGLE_ADS_ID && GOOGLE_ADS_PURCHASE_LABEL) {
    trackEventOnce(
      `ads_purchase:${transactionId}`,
      'conversion',
      {
        send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`,
        transaction_id: transactionId,
        currency: normalizeText(currency, 'MXN'),
        value: roundMoney(amount)
      }
    )
  }

  return purchaseTracked
}
