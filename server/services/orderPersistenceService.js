/* global process */

function getSupabaseCredentials() {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim()
  const supabaseKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || ''
  ).trim()

  return { supabaseUrl, supabaseKey }
}

function parseItemsFromMetadata(metadata = {}) {
  const summary = String(metadata.cart_items_summary || '').trim()
  const count = Number(metadata.cart_items_count || 0)

  if (!summary && (!Number.isFinite(count) || count <= 0)) {
    return []
  }

  return [{
    summary,
    count: Number.isFinite(count) ? count : 0
  }]
}

function buildDeliveryPayload(metadata = {}) {
  return {
    fulfillment_type: String(metadata.fulfillment_type || 'delivery'),
    date: String(metadata.delivery_date || ''),
    time: String(metadata.delivery_time || ''),
    city: String(metadata.delivery_city || ''),
    address: String(metadata.delivery_address || ''),
    neighborhood: String(metadata.delivery_neighborhood || ''),
    postal_code: String(metadata.delivery_postal_code || ''),
    notes: String(metadata.delivery_notes || '')
  }
}

export async function upsertPaidOrder({
  provider,
  paymentId,
  paymentStatus,
  amountMxn,
  currency,
  customerEmail,
  customerName,
  customerPhone,
  metadata,
  paymentPayload
}) {
  const { supabaseUrl, supabaseKey } = getSupabaseCredentials()
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[pedidos] Supabase no configurado; se omite persistencia del pedido')
    return
  }

  const row = {
    payment_provider: provider,
    payment_id: String(paymentId || '').trim(),
    payment_status: String(paymentStatus || '').trim(),
    amount_mxn: Number.isFinite(Number(amountMxn))
      ? Number(Number(amountMxn).toFixed(2))
      : 0,
    currency: String(currency || 'mxn').toLowerCase(),
    customer_email: String(customerEmail || '').trim() || null,
    customer_name: String(customerName || '').trim() || null,
    customer_phone: String(customerPhone || '').trim() || null,
    delivery: buildDeliveryPayload(metadata),
    items: parseItemsFromMetadata(metadata),
    payment_payload: paymentPayload || {}
  }

  // payment_id is the natural unique key for idempotent writes.
  if (!row.payment_id) {
    throw new Error('No se puede persistir pedido sin payment_id')
  }

  const url = new URL('/rest/v1/pedidos', supabaseUrl)
  url.searchParams.set('on_conflict', 'payment_id')

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      // Merge if row already exists with same payment_id.
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([row])
  })

  if (!response.ok) {
    const errorPayload = await response.text()
    throw new Error(`No se pudo guardar pedido en Supabase: ${response.status} ${errorPayload}`)
  }
}
