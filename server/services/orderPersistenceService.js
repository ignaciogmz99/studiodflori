/* global process */

const PROCESSING_CLAIM_TIMEOUT_MS = 10 * 60 * 1000

let comprobantesSchemaSupport = null

export function resetComprobantesSchemaSupportCache() {
  comprobantesSchemaSupport = null
}

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
  return fetch(url, {
    method,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  })
}

async function detectComprobantesSchemaSupport({ supabaseUrl, supabaseKey }) {
  if (comprobantesSchemaSupport) {
    return comprobantesSchemaSupport
  }

  const support = {
    schemaInspected: false,
    paymentColumns: false,
    webhookStateColumns: false,
    processingClaimColumns: false,
    processingDiagnosticColumns: false
  }

  const paymentColumnsUrl = new URL('/rest/v1/comprobantes', supabaseUrl)
  paymentColumnsUrl.searchParams.set('select', 'payment_id,order_id,source')
  paymentColumnsUrl.searchParams.set('limit', '1')

  try {
    const paymentColumnsResponse = await supabaseRequest({
      url: paymentColumnsUrl.toString(),
      supabaseKey
    })

    if (paymentColumnsResponse.ok) {
      support.paymentColumns = true
    } else {
      const details = await paymentColumnsResponse.text()
      if (paymentColumnsResponse.status === 400 && /payment_id|order_id|source/i.test(details)) {
        console.warn('[comprobantes] la tabla no tiene payment_id/order_id/source; se usara modo legacy sin deduplicacion fuerte')
      } else {
        throw new Error(`No se pudo inspeccionar columnas base de comprobantes: ${paymentColumnsResponse.status} ${details}`)
      }
    }

    const webhookStateUrl = new URL('/rest/v1/comprobantes', supabaseUrl)
    webhookStateUrl.searchParams.set('select', 'payment_id,pdf_path,pdf_generated_at,whatsapp_sent_at')
    webhookStateUrl.searchParams.set('limit', '1')

    const webhookStateResponse = await supabaseRequest({
      url: webhookStateUrl.toString(),
      supabaseKey
    })

    if (webhookStateResponse.ok) {
      support.webhookStateColumns = true
    } else {
      const details = await webhookStateResponse.text()
      if (webhookStateResponse.status === 400 && /pdf_path|pdf_generated_at|whatsapp_sent_at/i.test(details)) {
        console.warn('[comprobantes] la tabla no tiene columnas de estado de webhook; se omitira persistencia de PDF/WhatsApp')
      } else {
        throw new Error(`No se pudo inspeccionar columnas de estado de webhook: ${webhookStateResponse.status} ${details}`)
      }
    }

    const processingClaimUrl = new URL('/rest/v1/comprobantes', supabaseUrl)
    processingClaimUrl.searchParams.set('select', 'pdf_processing_started_at,whatsapp_processing_started_at')
    processingClaimUrl.searchParams.set('limit', '1')

    const processingClaimResponse = await supabaseRequest({
      url: processingClaimUrl.toString(),
      supabaseKey
    })

    if (processingClaimResponse.ok) {
      support.processingClaimColumns = true
    } else {
      const details = await processingClaimResponse.text()
      if (processingClaimResponse.status === 400 && /pdf_processing_started_at|whatsapp_processing_started_at/i.test(details)) {
        console.warn('[comprobantes] la tabla no tiene columnas de claim; se usara bloqueo en memoria de la instancia')
      } else {
        throw new Error(`No se pudo inspeccionar columnas de claim de webhook: ${processingClaimResponse.status} ${details}`)
      }
    }

    const processingDiagnosticUrl = new URL('/rest/v1/comprobantes', supabaseUrl)
    processingDiagnosticUrl.searchParams.set(
      'select',
      'pdf_processing_owner,whatsapp_processing_owner,processing_last_event,processing_last_error,processing_last_actor,processing_updated_at'
    )
    processingDiagnosticUrl.searchParams.set('limit', '1')

    const processingDiagnosticResponse = await supabaseRequest({
      url: processingDiagnosticUrl.toString(),
      supabaseKey
    })

    if (processingDiagnosticResponse.ok) {
      support.processingDiagnosticColumns = true
    } else {
      const details = await processingDiagnosticResponse.text()
      if (processingDiagnosticResponse.status === 400 && /pdf_processing_owner|whatsapp_processing_owner|processing_last_event|processing_last_error|processing_last_actor|processing_updated_at/i.test(details)) {
        console.warn('[comprobantes] la tabla no tiene columnas de diagnostico de post-pago; se usaran solo logs del servidor')
      } else {
        throw new Error(`No se pudo inspeccionar columnas de diagnostico de webhook: ${processingDiagnosticResponse.status} ${details}`)
      }
    }
  } catch (error) {
    console.warn('[comprobantes] no se pudo verificar soporte de columnas:', error?.message || error)
    return support
  }

  support.schemaInspected = true
  comprobantesSchemaSupport = support
  return support
}

function assertModernComprobantesSchema(schemaSupport) {
  if (!schemaSupport.schemaInspected) {
    throw new Error('No se pudo verificar el esquema de comprobantes; se reintentara para evitar registros incompletos')
  }

  if (!schemaSupport.paymentColumns || !schemaSupport.webhookStateColumns) {
    throw new Error('La tabla comprobantes necesita las columnas de webhook. Ejecuta docs/alter_comprobantes_for_webhooks.sql en Supabase.')
  }
}

function buildProcessingSelect(schemaSupport) {
  const baseColumns = 'payment_id,order_id,source,pdf_path,pdf_generated_at,whatsapp_sent_at'
  const extraColumns = []

  if (schemaSupport?.processingClaimColumns) {
    extraColumns.push('pdf_processing_started_at', 'whatsapp_processing_started_at')
  }

  if (schemaSupport?.processingDiagnosticColumns) {
    extraColumns.push(
      'pdf_processing_owner',
      'whatsapp_processing_owner',
      'processing_last_event',
      'processing_last_error',
      'processing_last_actor',
      'processing_updated_at'
    )
  }

  return extraColumns.length > 0
    ? `${baseColumns},${extraColumns.join(',')}`
    : baseColumns
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

  const schemaSupport = await detectComprobantesSchemaSupport({ supabaseUrl, supabaseKey })
  if (!schemaSupport.paymentColumns) {
    return null
  }

  const url = new URL('/rest/v1/comprobantes', supabaseUrl)
  url.searchParams.set('select', buildProcessingSelect(schemaSupport))
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

function buildPaidOrderRow({
  amountMxn,
  customerName,
  customerPhone,
  metadata,
  paidAt,
  paymentId,
  orderId,
  source,
  schemaSupport
}) {
  const fallbackDateTime = toDateParts(paidAt || new Date().toISOString())
  const rawFecha = String(metadata?.delivery_date || '').trim()
  const rawHora = String(metadata?.delivery_time || '').trim()
  const normalizedPaymentId = String(paymentId || '').trim()
  const normalizedOrderId = String(orderId || metadata?.order_id || '').trim()

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

  if (schemaSupport.paymentColumns) {
    row.payment_id = normalizedPaymentId || null
    row.order_id = normalizedOrderId || null
    row.source = String(source || 'mercadopago_webhook').trim() || 'mercadopago_webhook'
  }

  return row
}

export async function getPaidOrderProcessingState({ paymentId, orderId } = {}) {
  const { supabaseUrl, supabaseKey } = getSupabaseCredentials()
  if (!supabaseUrl || !supabaseKey) {
    return null
  }

  return findExistingPaidOrder({
    supabaseUrl,
    supabaseKey,
    paymentId: String(paymentId || '').trim(),
    orderId: String(orderId || '').trim()
  })
}

export async function getPaidOrderReceiptReference({ paymentId, orderId } = {}) {
  const { supabaseUrl, supabaseKey } = getSupabaseCredentials()
  if (!supabaseUrl || !supabaseKey) {
    return null
  }

  const normalizedPaymentId = String(paymentId || '').trim()
  const normalizedOrderId = String(orderId || '').trim()
  if (!normalizedPaymentId || !normalizedOrderId) {
    return null
  }

  const schemaSupport = await detectComprobantesSchemaSupport({ supabaseUrl, supabaseKey })
  if (!schemaSupport.paymentColumns || !schemaSupport.webhookStateColumns) {
    return null
  }

  const url = new URL('/rest/v1/comprobantes', supabaseUrl)
  url.searchParams.set('select', 'payment_id,order_id,pdf_path,pdf_generated_at,whatsapp_sent_at')
  url.searchParams.set('payment_id', `eq.${normalizedPaymentId}`)
  url.searchParams.set('order_id', `eq.${normalizedOrderId}`)
  url.searchParams.set('limit', '1')

  const response = await supabaseRequest({
    url: url.toString(),
    supabaseKey
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`No se pudo consultar comprobante para descarga: ${response.status} ${details}`)
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

  const normalizedPaymentId = String(paymentId || '').trim()
  const normalizedOrderId = String(orderId || metadata?.order_id || '').trim()
  const schemaSupport = await detectComprobantesSchemaSupport({ supabaseUrl, supabaseKey })
  assertModernComprobantesSchema(schemaSupport)
  const existingRow = await findExistingPaidOrder({
    supabaseUrl,
    supabaseKey,
    paymentId: normalizedPaymentId,
    orderId: normalizedOrderId
  })

  const row = buildPaidOrderRow({
    amountMxn,
    customerName,
    customerPhone,
    metadata,
    paidAt,
    paymentId: normalizedPaymentId,
    orderId: normalizedOrderId,
    source,
    schemaSupport
  })

  if (existingRow) {
    return {
      persisted: true,
      duplicate: true,
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId,
      row: existingRow
    }
  }

  const url = new URL('/rest/v1/comprobantes', supabaseUrl)

  const response = await supabaseRequest({
    url: url.toString(),
    supabaseKey,
    method: 'POST',
    body: [row],
    prefer: 'return=representation'
  })

  if (!response.ok) {
    const errorPayload = await response.text()
    let errorData = {}
    try { errorData = JSON.parse(errorPayload) } catch { /* payload no es JSON válido */ }
    // Race condition: otro webhook concurrente ya insertó el mismo payment_id.
    // Si hay UNIQUE constraint en Supabase, el INSERT falla con 23505.
    // Tratarlo como duplicado: re-fetch y devolver el registro existente.
    const isUniqueViolation =
      response.status === 409 ||
      String(errorData?.code || '') === '23505' ||
      /unique|duplicate/i.test(errorData?.message || '')
    if (isUniqueViolation && (normalizedPaymentId || normalizedOrderId)) {
      const refetched = await findExistingPaidOrder({
        supabaseUrl,
        supabaseKey,
        paymentId: normalizedPaymentId,
        orderId: normalizedOrderId
      })
      return {
        persisted: true,
        duplicate: true,
        race: true,
        paymentId: normalizedPaymentId,
        orderId: normalizedOrderId,
        row: refetched
      }
    }
    throw new Error(`No se pudo guardar comprobante en Supabase: ${response.status} ${errorPayload}`)
  }

  const rows = await response.json()
  const persistedRow = Array.isArray(rows) ? rows[0] || null : null

  return {
    persisted: true,
    duplicate: Boolean(existingRow),
    paymentId: normalizedPaymentId,
    orderId: normalizedOrderId,
    row: persistedRow || existingRow
  }
}

export async function updatePaidOrderProcessingState({
  paymentId,
  orderId,
  pdfPath,
  pdfGeneratedAt,
  whatsappSentAt,
  pdfProcessingStartedAt,
  whatsappProcessingStartedAt,
  pdfProcessingOwner,
  whatsappProcessingOwner,
  processingLastEvent,
  processingLastError,
  processingLastActor,
  processingUpdatedAt
} = {}) {
  const { supabaseUrl, supabaseKey } = getSupabaseCredentials()
  if (!supabaseUrl || !supabaseKey) {
    return { updated: false, skipped: true, reason: 'supabase_not_configured' }
  }

  const normalizedPaymentId = String(paymentId || '').trim()
  const normalizedOrderId = String(orderId || '').trim()
  const schemaSupport = await detectComprobantesSchemaSupport({ supabaseUrl, supabaseKey })

  if (!schemaSupport.schemaInspected || !schemaSupport.paymentColumns || !schemaSupport.webhookStateColumns || (!normalizedPaymentId && !normalizedOrderId)) {
    return { updated: false, skipped: true, reason: 'schema_not_supported' }
  }

  const patch = {}
  if (pdfPath !== undefined) {
    patch.pdf_path = String(pdfPath || '').trim() || null
  }
  if (pdfGeneratedAt !== undefined) {
    patch.pdf_generated_at = pdfGeneratedAt || null
  }
  if (whatsappSentAt !== undefined) {
    patch.whatsapp_sent_at = whatsappSentAt || null
  }
  if (schemaSupport.processingClaimColumns && pdfProcessingStartedAt !== undefined) {
    patch.pdf_processing_started_at = pdfProcessingStartedAt || null
  }
  if (schemaSupport.processingClaimColumns && whatsappProcessingStartedAt !== undefined) {
    patch.whatsapp_processing_started_at = whatsappProcessingStartedAt || null
  }
  if (schemaSupport.processingDiagnosticColumns && pdfProcessingOwner !== undefined) {
    patch.pdf_processing_owner = String(pdfProcessingOwner || '').trim() || null
  }
  if (schemaSupport.processingDiagnosticColumns && whatsappProcessingOwner !== undefined) {
    patch.whatsapp_processing_owner = String(whatsappProcessingOwner || '').trim() || null
  }
  if (schemaSupport.processingDiagnosticColumns && processingLastEvent !== undefined) {
    patch.processing_last_event = String(processingLastEvent || '').trim() || null
  }
  if (schemaSupport.processingDiagnosticColumns && processingLastError !== undefined) {
    patch.processing_last_error = String(processingLastError || '').trim() || null
  }
  if (schemaSupport.processingDiagnosticColumns && processingLastActor !== undefined) {
    patch.processing_last_actor = String(processingLastActor || '').trim() || null
  }
  if (schemaSupport.processingDiagnosticColumns && processingUpdatedAt !== undefined) {
    patch.processing_updated_at = processingUpdatedAt || null
  }

  if (Object.keys(patch).length === 0) {
    return { updated: false, skipped: true, reason: 'empty_patch' }
  }

  const url = new URL('/rest/v1/comprobantes', supabaseUrl)
  url.searchParams.set('select', buildProcessingSelect(schemaSupport))
  url.searchParams.set('limit', '1')

  if (normalizedPaymentId) {
    url.searchParams.set('payment_id', `eq.${normalizedPaymentId}`)
  } else {
    url.searchParams.set('order_id', `eq.${normalizedOrderId}`)
  }

  const response = await supabaseRequest({
    url: url.toString(),
    supabaseKey,
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation'
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`No se pudo actualizar estado de comprobante: ${response.status} ${details}`)
  }

  const rows = await response.json()
  return {
    updated: true,
    row: Array.isArray(rows) ? rows[0] || null : null
  }
}

export async function claimPaidOrderProcessingStage({
  paymentId,
  orderId,
  stage,
  claimTimeoutMs = PROCESSING_CLAIM_TIMEOUT_MS,
  processingOwner,
  processingEvent
} = {}) {
  const { supabaseUrl, supabaseKey } = getSupabaseCredentials()
  if (!supabaseUrl || !supabaseKey) {
    return { claimed: true, skipped: true, reason: 'supabase_not_configured' }
  }

  const normalizedPaymentId = String(paymentId || '').trim()
  const normalizedOrderId = String(orderId || '').trim()
  if (!normalizedPaymentId && !normalizedOrderId) {
    return { claimed: false, skipped: true, reason: 'missing_order_reference' }
  }

  const schemaSupport = await detectComprobantesSchemaSupport({ supabaseUrl, supabaseKey })
  assertModernComprobantesSchema(schemaSupport)

  if (!schemaSupport.processingClaimColumns) {
    return {
      claimed: true,
      unsupported: true,
      reason: 'processing_claim_columns_not_available'
    }
  }

  const normalizedStage = String(stage || '').trim().toLowerCase()
  const stageConfig = {
    pdf: {
      claimColumn: 'pdf_processing_started_at',
      finalColumn: 'pdf_generated_at',
      ownerColumn: 'pdf_processing_owner'
    },
    whatsapp: {
      claimColumn: 'whatsapp_processing_started_at',
      finalColumn: 'whatsapp_sent_at',
      ownerColumn: 'whatsapp_processing_owner'
    }
  }[normalizedStage]

  if (!stageConfig) {
    throw new Error(`Etapa de procesamiento invalida: ${stage}`)
  }

  const now = new Date()
  const cutoff = new Date(now.getTime() - claimTimeoutMs).toISOString()
  const url = new URL('/rest/v1/comprobantes', supabaseUrl)
  url.searchParams.set('select', buildProcessingSelect(schemaSupport))
  url.searchParams.set('limit', '1')
  url.searchParams.set(stageConfig.finalColumn, 'is.null')
  url.searchParams.set('or', `(${stageConfig.claimColumn}.is.null,${stageConfig.claimColumn}.lt.${cutoff})`)

  if (normalizedPaymentId) {
    url.searchParams.set('payment_id', `eq.${normalizedPaymentId}`)
  } else {
    url.searchParams.set('order_id', `eq.${normalizedOrderId}`)
  }

  const patch = {
    [stageConfig.claimColumn]: now.toISOString()
  }

  if (schemaSupport.processingDiagnosticColumns) {
    if (processingOwner !== undefined) {
      patch[stageConfig.ownerColumn] = String(processingOwner || '').trim() || null
      patch.processing_last_actor = String(processingOwner || '').trim() || null
    }
    if (processingEvent !== undefined) {
      patch.processing_last_event = String(processingEvent || '').trim() || null
    }
    patch.processing_last_error = null
    patch.processing_updated_at = now.toISOString()
  }

  const response = await supabaseRequest({
    url: url.toString(),
    supabaseKey,
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation'
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`No se pudo tomar claim de ${normalizedStage}: ${response.status} ${details}`)
  }

  const rows = await response.json()
  const row = Array.isArray(rows) ? rows[0] || null : null
  if (!row && schemaSupport.processingDiagnosticColumns && processingOwner !== undefined) {
    const refetched = await findExistingPaidOrder({
      supabaseUrl,
      supabaseKey,
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId
    })
    const ownClaim = refetched
      && !refetched[stageConfig.finalColumn]
      && refetched[stageConfig.claimColumn]
      && String(refetched[stageConfig.ownerColumn] || '').trim() === String(processingOwner || '').trim()

    if (ownClaim) {
      return {
        claimed: true,
        row: refetched,
        recoveredFromEmptyRepresentation: true
      }
    }

    return {
      claimed: false,
      row: refetched || null
    }
  }

  return {
    claimed: Boolean(row),
    row
  }
}
