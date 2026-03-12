/* global process */

let comprobantesSupportsPaymentColumns = null

function getSupabaseCredentials() {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim()
  const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

  return { supabaseUrl, supabaseKey }
}

function buildLocationFromMetadata(metadata = {}) {
  const addressParts = [
    String(metadata.delivery_address || '').trim(),
    String(metadata.delivery_neighborhood || '').trim(),
    String(metadata.delivery_city || '').trim(),
    String(metadata.delivery_postal_code || '').trim()
  ].filter(Boolean)

  return addressParts.join(', ')
}

function toDateParts(value) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date()
    return {
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 8)
    }
  }
  return {
    date: parsed.toISOString().slice(0, 10),
    time: parsed.toISOString().slice(11, 19)
  }
}

async function supabaseRequest({ url, supabaseKey, method = 'GET', body, prefer } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  })

  return response
}

async function detectComprobantesPaymentColumns({ supabaseUrl, supabaseKey }) {
  if (typeof comprobantesSupportsPaymentColumns === 'boolean') {
    return comprobantesSupportsPaymentColumns
  }

  const url = new URL('/rest/v1/comprobantes', supabaseUrl)
  url.searchParams.set('select', 'payment_id,order_id')
  url.searchParams.set('limit', '1')

  try {
    const response = await supabaseRequest({
      url: url.toString(),
      supabaseKey
    })

    if (response.ok) {
      comprobantesSupportsPaymentColumns = true
      return true
    }

    const details = await response.text()
    if (response.status === 400 && /payment_id|order_id/i.test(details)) {
      comprobantesSupportsPaymentColumns = false
      console.warn('[comprobantes] la tabla no tiene payment_id/order_id; se usara modo legacy sin deduplicacion fuerte')
      return false
    }

    throw new Error(`No se pudo inspeccionar columnas de comprobantes: ${response.status} ${details}`)
  } catch (error) {
    console.warn('[comprobantes] no se pudo verificar soporte de payment_id/order_id:', error?.message || error)
    comprobantesSupportsPaymentColumns = false
    return false
  }
}

async function findExistingPaidOrder({
  supabaseUrl,
  supabaseKey,
  paymentId,
  orderId
}) {
  if (!paymentId && !orderId) {
    return null
  }

  const supportsPaymentColumns = await detectComprobantesPaymentColumns({ supabaseUrl, supabaseKey })
  if (!supportsPaymentColumns) {
    return null
  }

  const url = new URL('/rest/v1/comprobantes', supabaseUrl)
  url.searchParams.set('select', 'payment_id,order_id')
  url.searchParams.set('limit', '1')

  if (paymentId) {
    url.searchParams.set('payment_id', `eq.${paymentId}`)
  } else if (orderId) {
    url.searchParams.set('order_id', `eq.${orderId}`)
  }

  const response = await supabaseRequest({
    url: url.toString(),
    supabaseKey
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`No se pudo consultar comprobante existente: ${response.status} ${details}`)
  }

  const rows = await response.json()
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

export async function upsertPaidOrder({
  amountMxn,
  customerName,
  customerPhone,
  metadata,
  paidAt,
  paymentId,
  orderId,
  source = 'mercadopago_webhook'
}) {
  const { supabaseUrl, supabaseKey } = getSupabaseCredentials()
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[comprobantes] Supabase no configurado; se omite persistencia del comprobante')
    return { persisted: false, skipped: true, reason: 'supabase_not_configured' }
  }

  const fallbackDateTime = toDateParts(paidAt || new Date().toISOString())
  const rawFecha = String(metadata?.delivery_date || '').trim()
  const rawHora = String(metadata?.delivery_time || '').trim()
  const normalizedPaymentId = String(paymentId || '').trim()
  const normalizedOrderId = String(orderId || metadata?.order_id || '').trim()
  const supportsPaymentColumns = await detectComprobantesPaymentColumns({ supabaseUrl, supabaseKey })
  const existingRow = await findExistingPaidOrder({
    supabaseUrl,
    supabaseKey,
    paymentId: normalizedPaymentId,
    orderId: normalizedOrderId
  })

  if (existingRow) {
    return {
      persisted: true,
      duplicate: true,
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId
    }
  }

  const row = {
    nombre: String(customerName || metadata?.customer_name || '').trim() || 'N/A',
    numero: String(customerPhone || metadata?.customer_phone || '').trim() || 'N/A',
    flores_pidio: String(metadata?.cart_items_summary || '').trim() || 'Sin detalle',
    precio_pago: Number.isFinite(Number(amountMxn))
      ? Number(Number(amountMxn).toFixed(2))
      : 0,
    ubicacion: buildLocationFromMetadata(metadata) || 'N/A',
    fecha: rawFecha || fallbackDateTime.date,
    hora: rawHora || fallbackDateTime.time
  }

  if (supportsPaymentColumns) {
    row.payment_id = normalizedPaymentId || null
    row.order_id = normalizedOrderId || null
    row.source = String(source || 'mercadopago_webhook').trim() || 'mercadopago_webhook'
  }

  const url = new URL('/rest/v1/comprobantes', supabaseUrl)

  const response = await supabaseRequest({
    url: url.toString(),
    supabaseKey,
    method: 'POST',
    body: [row],
    prefer: 'return=minimal'
  })

  if (!response.ok) {
    const errorPayload = await response.text()
    throw new Error(`No se pudo guardar comprobante en Supabase: ${response.status} ${errorPayload}`)
  }

  return {
    persisted: true,
    duplicate: false,
    paymentId: normalizedPaymentId,
    orderId: normalizedOrderId
  }
}
