/* global process */

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

export async function upsertPaidOrder({
  amountMxn,
  customerName,
  customerPhone,
  metadata,
  paidAt
}) {
  const { supabaseUrl, supabaseKey } = getSupabaseCredentials()
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[comprobantes] Supabase no configurado; se omite persistencia del comprobante')
    return
  }

  const fallbackDateTime = toDateParts(paidAt || new Date().toISOString())
  const rawFecha = String(metadata?.delivery_date || '').trim()
  const rawHora = String(metadata?.delivery_time || '').trim()
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

  const url = new URL('/rest/v1/comprobantes', supabaseUrl)

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify([row])
  })

  if (!response.ok) {
    const errorPayload = await response.text()
    throw new Error(`No se pudo guardar comprobante en Supabase: ${response.status} ${errorPayload}`)
  }
}
