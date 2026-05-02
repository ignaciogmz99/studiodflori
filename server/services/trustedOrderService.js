/* global process */
const MAX_ITEMS = 50
const MAX_QTY_PER_ITEM = 20
const COURSE_PRODUCT_ID = 'Curso'
const COURSE_TABLES = ['Curso', 'curso']

function getSupabaseCredentials() {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim()
  const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

  return { supabaseUrl, supabaseKey }
}

function sanitizeProductId(rawValue) {
  return String(rawValue || '').trim().slice(0, 120)
}

function normalizeClientItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No hay productos para procesar el pago')
  }
  if (items.length > MAX_ITEMS) {
    throw new Error(`No se permiten mas de ${MAX_ITEMS} productos por orden`)
  }

  const normalized = []
  const quantityById = new Map()

  for (const item of items) {
    const id = sanitizeProductId(item?.id)
    if (!id) {
      continue
    }
    // Clamp quantity to avoid abusive values while keeping checkout resilient.
    const quantity = Math.max(1, Math.min(MAX_QTY_PER_ITEM, Number(item?.quantity) || 1))
    quantityById.set(id, (quantityById.get(id) || 0) + quantity)
  }

  for (const [id, quantity] of quantityById.entries()) {
    normalized.push({ id, quantity })
  }

  if (normalized.length === 0) {
    throw new Error('No hay productos validos para procesar el pago')
  }

  return normalized
}

function quotePostgrestValue(value) {
  return `"${String(value).replaceAll('"', '')}"`
}

async function supabaseRequest({ url, supabaseKey }) {
  return fetch(url.toString(), {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  })
}

async function fetchProductsByIds(productIds) {
  const { supabaseUrl, supabaseKey } = getSupabaseCredentials()
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en server/.env')
  }

  const products = await fetchCatalogRowsByIds({
    supabaseUrl,
    supabaseKey,
    tableName: 'productos',
    productIds
  })
  const productMap = new Map(products.map((product) => [String(product.id), product]))
  const missingIds = productIds.filter((productId) => !productMap.has(productId))

  if (missingIds.includes(COURSE_PRODUCT_ID)) {
    const courseProduct = await fetchCourseProduct({ supabaseUrl, supabaseKey })
    if (courseProduct) {
      productMap.set(COURSE_PRODUCT_ID, courseProduct)
    }
  }

  return productIds
    .map((productId) => productMap.get(productId))
    .filter(Boolean)
}

async function fetchCatalogRowsByIds({ supabaseUrl, supabaseKey, tableName, productIds }) {
  const url = new URL('/rest/v1/productos', supabaseUrl)
  url.pathname = `/rest/v1/${encodeURIComponent(tableName)}`
  url.searchParams.set('select', 'id,precio,activo')
  url.searchParams.set('id', `in.(${productIds.map(quotePostgrestValue).join(',')})`)

  const response = await fetch(url.toString(), {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  })

  if (!response.ok) {
    const errorPayload = await response.text()
    throw new Error(`No se pudo consultar productos en Supabase: ${response.status} ${errorPayload}`)
  }

  const payload = await response.json()
  return Array.isArray(payload) ? payload : []
}

function normalizeCourseProduct(record) {
  if (!record || typeof record !== 'object') {
    return null
  }

  return {
    id: COURSE_PRODUCT_ID,
    nombre: record.nombre || record.name || record.titulo || 'Curso intensivo floral para principiantes',
    precio: record.precio ?? record.price ?? record.costo ?? record.monto ?? record.precio_reserva ?? record.precioReserva,
    activo: record.activo ?? record.active ?? true
  }
}

async function fetchCourseProductFromTable({ supabaseUrl, supabaseKey, tableName }) {
  const byIdUrl = new URL(`/rest/v1/${encodeURIComponent(tableName)}`, supabaseUrl)
  byIdUrl.searchParams.set('select', '*')
  byIdUrl.searchParams.set('id', `eq.${COURSE_PRODUCT_ID}`)
  byIdUrl.searchParams.set('limit', '1')

  const byIdResponse = await supabaseRequest({
    url: byIdUrl,
    supabaseKey
  })

  if (byIdResponse.ok) {
    const payload = await byIdResponse.json()
    const courseProduct = normalizeCourseProduct(Array.isArray(payload) ? payload[0] : payload)
    if (courseProduct) {
      return courseProduct
    }
  }

  const firstRowUrl = new URL(`/rest/v1/${encodeURIComponent(tableName)}`, supabaseUrl)
  firstRowUrl.searchParams.set('select', '*')
  firstRowUrl.searchParams.set('limit', '1')

  const firstRowResponse = await supabaseRequest({
    url: firstRowUrl,
    supabaseKey
  })

  if (!firstRowResponse.ok) {
    return null
  }

  const payload = await firstRowResponse.json()
  return normalizeCourseProduct(Array.isArray(payload) ? payload[0] : payload)
}

async function fetchCourseProduct({ supabaseUrl, supabaseKey }) {
  for (const tableName of COURSE_TABLES) {
    const courseProduct = await fetchCourseProductFromTable({ supabaseUrl, supabaseKey, tableName })
    if (courseProduct) {
      return courseProduct
    }
  }

  return null
}

export function validateOrderId(orderId) {
  const normalized = String(orderId || '').trim()
  // Restrict format to avoid malformed ids and easy abuse vectors.
  const isValid = /^[a-zA-Z0-9_-]{16,80}$/.test(normalized)
  if (!isValid) {
    throw new Error('orderId invalido')
  }
  return normalized
}

export function buildOrderFingerprint({ orderId, items }) {
  const stable = [
    orderId,
    ...items
      .map((item) => `${item.id}:${item.quantity}:${Number(item.unitPrice).toFixed(2)}`)
      .sort()
  ].join('|')

  return stable
}

export async function buildTrustedOrderFromClientItems(rawItems) {
  const normalizedItems = normalizeClientItems(rawItems)
  const productIds = normalizedItems.map((item) => item.id)
  const products = await fetchProductsByIds(productIds)
  const productMap = new Map(products.map((product) => [String(product.id), product]))

  const trustedItems = []
  let amount = 0

  for (const item of normalizedItems) {
    const product = productMap.get(item.id)
    const isActive = product?.activo !== false
    const price = Number(product?.precio)
    // Reject missing, inactive or invalid priced products before charging.
    if (!product || !isActive || !Number.isFinite(price) || price <= 0) {
      throw new Error(`Producto invalido o inactivo: ${item.id}`)
    }

    const unitPrice = Number(price.toFixed(2))
    const quantity = Math.max(1, Number(item.quantity) || 1)
    const lineTotal = Number((unitPrice * quantity).toFixed(2))

    trustedItems.push({
      id: String(product.id),
      name: String(product.nombre || product.id),
      quantity,
      unitPrice,
      lineTotal
    })
    amount += lineTotal
  }

  return {
    items: trustedItems,
    amount: Number(amount.toFixed(2))
  }
}
