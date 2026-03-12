/* global Buffer */
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsPDF } from 'jspdf'

const serviceDir = path.dirname(fileURLToPath(import.meta.url))
const receiptsDir = path.join(serviceDir, '..', 'generated_receipts')

function sanitizeFileSegment(value, fallback = 'sin-folio') {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, '')

  return normalized || fallback
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

  await mkdir(receiptsDir, { recursive: true })
  const filePath = path.join(receiptsDir, fileName)

  try {
    await access(filePath)
    return {
      fileName,
      filePath,
      pdfBuffer: null,
      alreadyExisted: true
    }
  } catch {
    // File does not exist yet; continue with generation.
  }

  await writeFile(filePath, pdfBuffer)

  return {
    fileName,
    filePath,
    pdfBuffer,
    alreadyExisted: false
  }
}
