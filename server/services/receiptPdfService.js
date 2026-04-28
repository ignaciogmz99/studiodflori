/* global Buffer, process */
import crypto from 'node:crypto'
import { access, mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsPDF } from 'jspdf'

const serviceDir = path.dirname(fileURLToPath(import.meta.url))
const defaultReceiptsDir = path.join(serviceDir, '..', 'generated_receipts')

export function getReceiptsDir() {
  const configuredDir = String(process.env.RECEIPTS_DIR || '').trim()
  if (!configuredDir) {
    return defaultReceiptsDir
  }

  return path.isAbsolute(configuredDir)
    ? configuredDir
    : path.resolve(process.cwd(), configuredDir)
}

function sanitizeFileSegment(value, fallback = 'sin-folio') {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, '')

  return normalized || fallback
}

function getS3ReceiptStorageConfig() {
  const endpoint = String(
    process.env.RECEIPTS_STORAGE_ENDPOINT ||
    process.env.S3_ENDPOINT_URL ||
    process.env.AWS_ENDPOINT_URL_S3 ||
    ''
  ).trim()
  const bucket = String(
    process.env.RECEIPTS_STORAGE_BUCKET ||
    process.env.S3_BUCKET ||
    ''
  ).trim()
  const accessKeyId = String(
    process.env.RECEIPTS_STORAGE_ACCESS_KEY_ID ||
    process.env.AWS_ACCESS_KEY_ID ||
    ''
  ).trim()
  const secretAccessKey = String(
    process.env.RECEIPTS_STORAGE_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    ''
  ).trim()
  const region = String(
    process.env.RECEIPTS_STORAGE_REGION ||
    process.env.AWS_REGION ||
    'auto'
  ).trim() || 'auto'

  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    bucket,
    accessKeyId,
    secretAccessKey,
    region
  }
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding)
}

function encodeS3PathSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function buildS3ObjectUrl({ endpoint, bucket, objectPath }) {
  const encodedPath = [
    bucket,
    ...String(objectPath || '').split('/').filter(Boolean)
  ].map(encodeS3PathSegment).join('/')

  return new URL(`/${encodedPath}`, endpoint)
}

function buildS3AuthHeaders({
  method,
  url,
  accessKeyId,
  secretAccessKey,
  region,
  body,
  contentType
}) {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256Hex(body || '')
  const headers = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  }

  if (contentType) {
    headers['content-type'] = contentType
  }

  const signedHeaders = Object.keys(headers).sort().join(';')
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}\n`)
    .join('')
  const canonicalRequest = [
    method,
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n')
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n')
  const signingKey = hmac(
    hmac(
      hmac(
        hmac(`AWS4${secretAccessKey}`, dateStamp),
        region
      ),
      's3'
    ),
    'aws4_request'
  )
  const signature = hmac(signingKey, stringToSign, 'hex')

  return {
    ...(contentType ? { 'Content-Type': contentType } : {}),
    Host: url.host,
    'X-Amz-Content-Sha256': payloadHash,
    'X-Amz-Date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  }
}

async function s3ReceiptRequest({ method, objectPath, body, contentType, bucket: requestedBucket } = {}) {
  const config = getS3ReceiptStorageConfig()
  const bucket = String(requestedBucket || config.bucket || '').trim()
  if (!config.endpoint || !bucket || !config.accessKeyId || !config.secretAccessKey) {
    return { skipped: true }
  }

  const url = buildS3ObjectUrl({
    endpoint: config.endpoint,
    bucket,
    objectPath
  })
  const headers = buildS3AuthHeaders({
    method,
    url,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    body,
    contentType
  })

  const response = await fetch(url.toString(), {
    method,
    headers,
    ...(body !== undefined && !['GET', 'HEAD'].includes(String(method || '').toUpperCase()) ? { body } : {})
  })

  return { response, bucket, objectPath }
}

async function uploadReceiptToSupabaseStorage({ fileName, pdfBuffer, folder = 'generated_receipts' } = {}) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim()
  const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const bucket = String(process.env.SUPABASE_RECEIPTS_BUCKET || '').trim()

  if (!supabaseUrl || !supabaseKey || !bucket || !pdfBuffer) {
    return { uploaded: false, skipped: true }
  }

  const objectPath = `${folder}/${fileName}`.replace(/^\/+/, '')
  const uploadUrl = new URL(`/storage/v1/object/${bucket}/${objectPath}`, supabaseUrl)

  const response = await fetch(uploadUrl.toString(), {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'false'
    },
    body: pdfBuffer
  })

  if (response.ok) {
    return {
      uploaded: true,
      objectPath,
      filePath: `supabase://${bucket}/${objectPath}`
    }
  }

  if (response.status === 409) {
    return {
      uploaded: true,
      objectPath,
      filePath: `supabase://${bucket}/${objectPath}`,
      alreadyExisted: true
    }
  }

  const details = await response.text()
  throw new Error(`No se pudo subir PDF a Supabase Storage (${response.status}): ${details}`)
}

async function uploadReceiptToS3Storage({ fileName, pdfBuffer, folder = 'generated_receipts' } = {}) {
  const objectPath = `${folder}/${fileName}`.replace(/^\/+/, '')
  const result = await s3ReceiptRequest({
    method: 'PUT',
    objectPath,
    body: pdfBuffer,
    contentType: 'application/pdf'
  })

  if (result.skipped) {
    return { uploaded: false, skipped: true }
  }

  if (result.response.ok) {
    return {
      uploaded: true,
      objectPath,
      filePath: `s3://${result.bucket}/${objectPath}`
    }
  }

  const details = await result.response.text()
  throw new Error(`No se pudo subir PDF a Object Storage (${result.response.status}): ${details}`)
}

export async function readReceiptFromS3Storage({ bucket, objectPath } = {}) {
  const result = await s3ReceiptRequest({
    method: 'GET',
    bucket,
    objectPath,
    body: ''
  })

  if (result.skipped) {
    throw new Error('Object Storage no esta configurado en el servidor')
  }

  if (!result.response.ok) {
    const details = await result.response.text()
    throw new Error(`No se pudo leer PDF desde Object Storage (${result.response.status}): ${details}`)
  }

  return Buffer.from(await result.response.arrayBuffer())
}

async function persistReceiptFile({ fileName, pdfBuffer } = {}) {
  const receiptsDir = getReceiptsDir()
  const s3Config = getS3ReceiptStorageConfig()
  console.log('[receipt pdf] preparando persistencia', {
    fileName,
    pdfBytes: Buffer.isBuffer(pdfBuffer) ? pdfBuffer.length : 0,
    cwd: process.cwd(),
    receiptsDir,
    hasSupabaseBucket: Boolean(String(process.env.SUPABASE_RECEIPTS_BUCKET || '').trim()),
    hasObjectStorageBucket: Boolean(s3Config.endpoint && s3Config.bucket && s3Config.accessKeyId && s3Config.secretAccessKey)
  })

  try {
    const storageResult = await uploadReceiptToSupabaseStorage({ fileName, pdfBuffer })
    if (storageResult.uploaded) {
      console.log('[receipt pdf] PDF guardado en Supabase Storage', {
        fileName,
        objectPath: storageResult.objectPath,
        alreadyExisted: Boolean(storageResult.alreadyExisted)
      })
      return {
        fileName,
        filePath: storageResult.filePath,
        pdfBuffer: null,
        alreadyExisted: Boolean(storageResult.alreadyExisted),
        storageObjectPath: storageResult.objectPath,
        storageProvider: 'supabase'
      }
    }
  } catch (error) {
    console.warn('[receipt pdf] fallo subiendo a Supabase Storage; se usara filesystem local:', error?.message || error)
  }

  try {
    const storageResult = await uploadReceiptToS3Storage({ fileName, pdfBuffer })
    if (storageResult.uploaded) {
      console.log('[receipt pdf] PDF guardado en Object Storage', {
        fileName,
        objectPath: storageResult.objectPath
      })
      return {
        fileName,
        filePath: storageResult.filePath,
        pdfBuffer: null,
        storageObjectPath: storageResult.objectPath,
        storageProvider: 's3'
      }
    }
  } catch (error) {
    console.warn('[receipt pdf] fallo subiendo a Object Storage; se usara filesystem local:', error?.message || error)
  }

  try {
    await mkdir(receiptsDir, { recursive: true })
  } catch (error) {
    throw new Error(`No se pudo preparar carpeta local de comprobantes (${receiptsDir}): ${error?.message || error}`)
  }

  const filePath = path.join(receiptsDir, fileName)

  try {
    await access(filePath)
    const fileStats = await stat(filePath).catch(() => null)
    console.log('[receipt pdf] PDF local ya existia', {
      fileName,
      filePath,
      sizeBytes: fileStats?.size ?? null
    })
    return {
      fileName,
      filePath,
      pdfBuffer: null,
      alreadyExisted: true,
      storageProvider: 'local'
    }
  } catch {
    // File does not exist yet; continue with generation.
  }

  try {
    await writeFile(filePath, pdfBuffer)
  } catch (error) {
    throw new Error(`No se pudo escribir PDF local (${filePath}): ${error?.message || error}`)
  }

  const fileStats = await stat(filePath).catch(() => null)
  console.log('[receipt pdf] PDF local escrito', {
    fileName,
    filePath,
    sizeBytes: fileStats?.size ?? null
  })

  return {
    fileName,
    filePath,
    pdfBuffer,
    alreadyExisted: false,
    storageProvider: 'local'
  }
}

export async function createDiagnosticReceiptPdf({ label = 'railway-receipts-test' } = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const createdAt = new Date().toISOString()
  const safeTimestamp = createdAt.replace(/[^0-9A-Z]/gi, '')
  const fileName = `diagnostico-receipts-${safeTimestamp}.pdf`

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Diagnostico de comprobantes', 40, 60)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.text(`Label: ${String(label || '').trim() || 'railway-receipts-test'}`, 40, 95)
  doc.text(`Creado: ${createdAt}`, 40, 115)
  doc.text(`Directorio configurado: ${getReceiptsDir()}`, 40, 135, { maxWidth: 500 })
  doc.text('Si ves este archivo en el volumen receipts, el mount path esta funcionando.', 40, 175, { maxWidth: 500 })

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
  return persistReceiptFile({ fileName, pdfBuffer })
}

function drawSectionTitle(doc, colors, marginX, contentWidth, cursorY, title) {
  doc.setFillColor(...colors.accent)
  doc.roundedRect(marginX, cursorY, contentWidth, 24, 6, 6, 'F')
  doc.setTextColor(...colors.text)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(String(title), marginX + 10, cursorY + 16)
  return cursorY + 34
}

function drawCard(doc, colors, marginX, contentWidth, cursorY, height) {
  doc.setFillColor(...colors.accentSoft)
  doc.setDrawColor(...colors.accentBorder)
  doc.roundedRect(marginX, cursorY - 14, contentWidth, height, 8, 8, 'FD')
}

function writeLine(doc, marginX, contentWidth, cursorY, text, options = {}) {
  const fontSize = options.fontSize || 10.5
  const maxWidth = options.maxWidth || (contentWidth - 16)
  doc.setFont('helvetica', options.bold ? 'bold' : 'normal')
  doc.setFontSize(fontSize)
  doc.setTextColor(47, 33, 48)
  const lines = doc.splitTextToSize(String(text || ''), maxWidth)
  doc.text(lines, marginX + 8, cursorY)
  return cursorY + (lines.length * (fontSize + 3))
}

function buildMetadataFromPaymentIntent(paymentIntent = {}) {
  const metadata = paymentIntent?.metadata || {}
  return {
    orderId: metadata.order_id || 'N/A',
    paymentId: paymentIntent?.id || 'N/A',
    source: 'Webhook Stripe',
    amount: Number(paymentIntent?.amount_received ?? paymentIntent?.amount ?? 0) / 100,
    currency: String(paymentIntent?.currency || 'MXN').toUpperCase(),
    approvedAt: new Date().toISOString(),
    customerName: metadata.customer_name || 'N/A',
    customerPhone: metadata.customer_phone || 'N/A',
    customerEmail: metadata.customer_email || 'N/A',
    deliveryType: String(metadata.fulfillment_type || 'delivery').toLowerCase() === 'pickup'
      ? 'Recoger en tienda'
      : 'Entrega a domicilio',
    deliveryDate: metadata.delivery_date || 'N/A',
    deliveryTime: metadata.delivery_time || 'N/A',
    deliveryCity: metadata.delivery_city || 'N/A',
    deliveryAddress: metadata.delivery_address || 'N/A',
    deliveryNeighborhood: metadata.delivery_neighborhood || 'N/A',
    deliveryPostalCode: metadata.delivery_postal_code || 'N/A',
    deliveryNotes: metadata.delivery_notes || 'N/A',
    cartItemsSummary: metadata.cart_items_summary || 'Sin detalle'
  }
}

function buildMetadataFromPayment(payment = {}) {
  const metadata = payment?.metadata || {}

  return {
    orderId: metadata.order_id || 'N/A',
    paymentId: payment?.id || 'N/A',
    source: 'Webhook Mercado Pago',
    amount: Number(payment?.transaction_amount || 0),
    currency: payment?.currency_id || 'MXN',
    approvedAt: payment?.date_approved || payment?.date_created || new Date().toISOString(),
    customerName: metadata.customer_name || payment?.payer?.first_name || 'N/A',
    customerPhone: metadata.customer_phone || 'N/A',
    customerEmail: payment?.payer?.email || 'N/A',
    deliveryType: String(metadata.fulfillment_type || 'delivery').toLowerCase() === 'pickup'
      ? 'Recoger en tienda'
      : 'Entrega a domicilio',
    deliveryDate: metadata.delivery_date || 'N/A',
    deliveryTime: metadata.delivery_time || 'N/A',
    deliveryCity: metadata.delivery_city || 'N/A',
    deliveryAddress: metadata.delivery_address || 'N/A',
    deliveryNeighborhood: metadata.delivery_neighborhood || 'N/A',
    deliveryPostalCode: metadata.delivery_postal_code || 'N/A',
    deliveryNotes: metadata.delivery_notes || 'N/A',
    cartItemsSummary: metadata.cart_items_summary || 'Sin detalle'
  }
}

export async function createMercadoPagoReceiptPdf(payment = {}) {
  const receipt = buildMetadataFromPayment(payment)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 34
  const contentWidth = pageWidth - (marginX * 2)
  let cursorY = 38
  const colors = {
    accent: [248, 148, 244],
    accentSoft: [255, 241, 253],
    accentBorder: [239, 183, 234],
    text: [47, 33, 48],
    textSoft: [124, 93, 120]
  }

  doc.setTextColor(...colors.text)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text('Comprobante de pago', marginX, cursorY + 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text('Studio dei Fiori', marginX, cursorY + 38)
  cursorY += 66

  cursorY = drawSectionTitle(doc, colors, marginX, contentWidth, cursorY, 'Pago confirmado')
  drawCard(doc, colors, marginX, contentWidth, cursorY, 118)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `No. de orden: ${receipt.orderId}`, { bold: true })
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Folio de pago: ${receipt.paymentId}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, 'Proveedor: Mercado Pago')
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Origen de registro: ${receipt.source}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Fecha: ${new Date(receipt.approvedAt).toLocaleString('es-MX')}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Total pagado: $${receipt.amount.toFixed(2)} ${receipt.currency}`)
  cursorY += 14

  cursorY = drawSectionTitle(doc, colors, marginX, contentWidth, cursorY, 'Datos del cliente')
  drawCard(doc, colors, marginX, contentWidth, cursorY, 90)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Nombre: ${receipt.customerName}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Telefono: ${receipt.customerPhone}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Email: ${receipt.customerEmail}`)
  cursorY += 14

  cursorY = drawSectionTitle(doc, colors, marginX, contentWidth, cursorY, 'Entrega')
  drawCard(doc, colors, marginX, contentWidth, cursorY, receipt.deliveryType === 'Recoger en tienda' ? 106 : 148)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Tipo: ${receipt.deliveryType}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Fecha de entrega: ${receipt.deliveryDate}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Horario deseado: ${receipt.deliveryTime}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Ciudad: ${receipt.deliveryCity}`)

  if (receipt.deliveryType !== 'Recoger en tienda') {
    cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Direccion: ${receipt.deliveryAddress}`)
    cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Colonia: ${receipt.deliveryNeighborhood}`)
    cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Codigo postal: ${receipt.deliveryPostalCode}`)
  }

  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Instrucciones: ${receipt.deliveryNotes}`)
  cursorY += 14

  cursorY = drawSectionTitle(doc, colors, marginX, contentWidth, cursorY, 'Productos')
  drawCard(doc, colors, marginX, contentWidth, cursorY, 88)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, receipt.cartItemsSummary)

  const footerY = pageHeight - 58
  doc.setDrawColor(...colors.accentBorder)
  doc.line(marginX, footerY - 14, marginX + contentWidth, footerY - 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...colors.textSoft)
  doc.text('Comprobante digital de Studio dei Fiori. Conserva este documento para cualquier aclaracion.', marginX, footerY)
  doc.text(`Emitido: ${new Date().toLocaleString('es-MX')}`, marginX, footerY + 12)

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
  const safePaymentId = sanitizeFileSegment(receipt.paymentId)
  const fileName = `comprobante-${safePaymentId}.pdf`
  return persistReceiptFile({ fileName, pdfBuffer })
}

export async function createStripeReceiptPdf(paymentIntent = {}) {
  const receipt = buildMetadataFromPaymentIntent(paymentIntent)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 34
  const contentWidth = pageWidth - (marginX * 2)
  let cursorY = 38
  const colors = {
    accent: [248, 148, 244],
    accentSoft: [255, 241, 253],
    accentBorder: [239, 183, 234],
    text: [47, 33, 48],
    textSoft: [124, 93, 120]
  }

  doc.setTextColor(...colors.text)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text('Comprobante de pago', marginX, cursorY + 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text('Studio dei Fiori', marginX, cursorY + 38)
  cursorY += 66

  cursorY = drawSectionTitle(doc, colors, marginX, contentWidth, cursorY, 'Pago confirmado')
  drawCard(doc, colors, marginX, contentWidth, cursorY, 118)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `No. de orden: ${receipt.orderId}`, { bold: true })
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Folio de pago: ${receipt.paymentId}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, 'Proveedor: Stripe')
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Origen de registro: ${receipt.source}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Fecha: ${new Date(receipt.approvedAt).toLocaleString('es-MX')}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Total pagado: $${receipt.amount.toFixed(2)} ${receipt.currency}`)
  cursorY += 14

  cursorY = drawSectionTitle(doc, colors, marginX, contentWidth, cursorY, 'Datos del cliente')
  drawCard(doc, colors, marginX, contentWidth, cursorY, 90)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Nombre: ${receipt.customerName}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Telefono: ${receipt.customerPhone}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Email: ${receipt.customerEmail}`)
  cursorY += 14

  cursorY = drawSectionTitle(doc, colors, marginX, contentWidth, cursorY, 'Entrega')
  drawCard(doc, colors, marginX, contentWidth, cursorY, receipt.deliveryType === 'Recoger en tienda' ? 106 : 148)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Tipo: ${receipt.deliveryType}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Fecha de entrega: ${receipt.deliveryDate}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Horario deseado: ${receipt.deliveryTime}`)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Ciudad: ${receipt.deliveryCity}`)

  if (receipt.deliveryType !== 'Recoger en tienda') {
    cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Direccion: ${receipt.deliveryAddress}`)
    cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Colonia: ${receipt.deliveryNeighborhood}`)
    cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Codigo postal: ${receipt.deliveryPostalCode}`)
  }

  cursorY = writeLine(doc, marginX, contentWidth, cursorY, `Instrucciones: ${receipt.deliveryNotes}`)
  cursorY += 14

  cursorY = drawSectionTitle(doc, colors, marginX, contentWidth, cursorY, 'Productos')
  drawCard(doc, colors, marginX, contentWidth, cursorY, 88)
  cursorY = writeLine(doc, marginX, contentWidth, cursorY, receipt.cartItemsSummary)

  const footerY = pageHeight - 58
  doc.setDrawColor(...colors.accentBorder)
  doc.line(marginX, footerY - 14, marginX + contentWidth, footerY - 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...colors.textSoft)
  doc.text('Comprobante digital de Studio dei Fiori. Conserva este documento para cualquier aclaracion.', marginX, footerY)
  doc.text(`Emitido: ${new Date().toLocaleString('es-MX')}`, marginX, footerY + 12)

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
  const safePaymentId = sanitizeFileSegment(receipt.paymentId)
  const fileName = `comprobante-stripe-${safePaymentId}.pdf`
  return persistReceiptFile({ fileName, pdfBuffer })
}
