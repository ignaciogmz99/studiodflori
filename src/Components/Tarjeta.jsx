import { useMemo, useRef, useState } from 'react'
import './Tarjeta.css'
import { useCart } from '../context/CartContext'
import { defaultPaymentProvider, getPaymentProvider, paymentProviders } from './payments'
import PaymentProviderBoundary from './payments/PaymentProviderBoundary'
import logoBien from '../assets/logo_bien.jpg'

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`No se pudo cargar imagen: ${url}`))
    image.src = url
  })
}

function Tarjeta() {
  const {
    items,
    totalPrice,
    backToPaymentForm,
    clearCart,
    deliveryDetails,
    selectedDeliveryCity,
    selectedDeliveryDate,
    selectedDeliveryTime
  } = useCart()

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
  const mpPublicKey = String(import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY || '').trim()
  const stripePublishableKey = String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim()
  const payableAmount = Number(totalPrice.toFixed(2))
  const [paymentProvider, setPaymentProvider] = useState(defaultPaymentProvider)
  const [receiptData, setReceiptData] = useState(null)
  const orderIdRef = useRef(
    `ord_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
  )

  const selectedProvider = useMemo(
    () => getPaymentProvider(paymentProvider),
    [paymentProvider]
  )
  const hasApprovedPayment = Boolean(receiptData)
  const displayedAmount = Number((receiptData?.amount ?? payableAmount) || 0)

  const normalizedDeliveryDetails = useMemo(() => {
    const phoneCountryCode = deliveryDetails.phoneCountryCode || '+52'
    const phoneDigits = onlyDigits(deliveryDetails.phone)

    return {
      ...deliveryDetails,
      phoneCountryCode,
      phone: phoneDigits ? `${phoneCountryCode}${phoneDigits}` : ''
    }
  }, [deliveryDetails])

  const SelectedPaymentComponent = selectedProvider.Component

  const handlePaymentApproved = (approvedPayload = {}) => {
    const now = new Date()
    const basePayload = {
      orderId: orderIdRef.current,
      provider: paymentProvider,
      paymentId: '',
      approvedAt: now.toISOString(),
      amount: payableAmount,
      currency: 'MXN',
      items,
      deliveryDetails: normalizedDeliveryDetails,
      selectedDeliveryCity,
      selectedDeliveryDate,
      selectedDeliveryTime
    }

    setReceiptData({
      ...basePayload,
      ...approvedPayload
    })

    // Persistence is handled server-side by the MercadoPago and Stripe webhooks.
    clearCart()
  }

  const downloadReceiptPdf = async () => {
    if (!receiptData) {
      return
    }

    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const mx = 42
    const cw = W - mx * 2
    let y = 0

    const C = {
      pink:       [210, 120, 198],
      pinkLight:  [245, 215, 242],
      pinkSoft:   [253, 245, 252],
      pinkBorder: [225, 175, 220],
      pinkDark:   [148,  68, 138],
      text:       [ 38,  24,  40],
      soft:       [130,  96, 126],
      light:      [185, 158, 182],
      white:      [255, 255, 255],
    }

    // ── HEADER ─────────────────────────────────────────────────────
    const hdrH = 82
    doc.setFillColor(...C.pink)
    doc.rect(0, 0, W, hdrH, 'F')
    // Bottom accent strip
    doc.setFillColor(...C.pinkDark)
    doc.rect(0, hdrH - 3, W, 3, 'F')

    try {
      const logo = await loadImage(logoBien)
      doc.addImage(logo, 'JPEG', mx, 15, 52, 52)
    } catch {
      // continue without logo
    }

    doc.setTextColor(...C.white)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    doc.text('Studio dei Fiori', mx + 64, 36)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.text('Comprobante oficial de pago', mx + 64, 52)

    // Top-right: order number
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text('COMPROBANTE', W - mx, 30, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`#${String(receiptData.orderId || 'N/A').slice(-14)}`, W - mx, 44, { align: 'right' })

    y = hdrH + 26

    // ── PAGO CONFIRMADO badge ──────────────────────────────────────
    const bw = 178
    const bh = 26
    doc.setFillColor(...C.pinkSoft)
    doc.setDrawColor(...C.pinkBorder)
    doc.roundedRect(mx, y, bw, bh, 13, 13, 'FD')
    doc.setTextColor(...C.pinkDark)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text('Pago confirmado', mx + bw / 2, y + 17, { align: 'center' })

    y += bh + 26

    // ── HELPERS ────────────────────────────────────────────────────
    const sectionHeader = (title) => {
      doc.setTextColor(...C.pinkDark)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.text(title.toUpperCase(), mx, y)
      y += 5
      doc.setDrawColor(...C.pinkBorder)
      doc.setLineWidth(1.2)
      doc.line(mx, y, mx + cw, y)
      y += 14
    }

    const labelCol = mx
    const valueCol = mx + 162
    const valueMaxW = cw - 166

    const row = (label, value) => {
      if (!value || value === 'N/A') {
        return
      }
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C.soft)
      doc.text(String(label), labelCol, y)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.text)
      const lines = doc.splitTextToSize(String(value), valueMaxW)
      doc.text(lines, valueCol, y)
      y += Math.max(20, lines.length * 13 + 4)
    }

    // ── INFORMACIÓN DEL PAGO ───────────────────────────────────────
    sectionHeader('Informacion del pago')

    const providerLabel = receiptData.provider === 'stripe'
      ? 'Stripe'
      : receiptData.provider === 'mercadopago'
        ? 'Mercado Pago'
        : String(receiptData.provider || 'N/A')

    const fechaStr = new Date(receiptData.approvedAt || Date.now()).toLocaleString('es-MX', {
      dateStyle: 'long',
      timeStyle: 'short'
    })

    row('No. de orden', receiptData.orderId)
    row('Folio de pago', receiptData.paymentId)
    row('Proveedor', providerLabel)
    row('Fecha', fechaStr)
    row('Total pagado', `$${Number(receiptData.amount || 0).toFixed(2)} ${receiptData.currency || 'MXN'}`)

    y += 8

    // ── DATOS DEL CLIENTE ──────────────────────────────────────────
    sectionHeader('Datos del cliente')
    row('Nombre', receiptData.deliveryDetails?.fullName)
    row('Telefono', receiptData.deliveryDetails?.phone)

    y += 8

    // ── ENTREGA ────────────────────────────────────────────────────
    const fulfillmentType = receiptData.deliveryDetails?.fulfillmentType === 'pickup'
      ? 'Recoger en tienda'
      : 'Entrega a domicilio'
    const recipient = receiptData.deliveryDetails?.recipientType === 'other'
      ? (receiptData.deliveryDetails?.recipientName || 'Otra persona')
      : 'El comprador'

    sectionHeader('Entrega')
    row('Tipo', fulfillmentType)
    row('Recibe', recipient)
    row('Fecha de entrega', receiptData.selectedDeliveryDate)
    row('Horario deseado', receiptData.selectedDeliveryTime)

    if (fulfillmentType !== 'Recoger en tienda') {
      row('Ciudad', receiptData.selectedDeliveryCity)
      row('Direccion', receiptData.deliveryDetails?.streetAddress)
      row('Colonia', receiptData.deliveryDetails?.neighborhood)
      row('Codigo postal', receiptData.deliveryDetails?.postalCode)
    }

    if (receiptData.deliveryDetails?.flowerMessage) {
      row('Mensaje', receiptData.deliveryDetails.flowerMessage)
    }

    if (receiptData.deliveryDetails?.specialInstructions) {
      row('Instrucciones', receiptData.deliveryDetails.specialInstructions)
    }

    y += 8

    // ── PRODUCTOS ──────────────────────────────────────────────────
    sectionHeader('Productos')

    // Table header row
    doc.setFillColor(...C.pinkLight)
    doc.rect(mx, y - 10, cw, 20, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...C.pinkDark)
    doc.text('Producto', mx + 8, y + 4)
    doc.text('Cant.', W - mx - 90, y + 4, { align: 'right' })
    doc.text('Importe', W - mx - 4, y + 4, { align: 'right' })
    y += 18

    const products = receiptData.items || []
    let subtotal = 0

    products.forEach((item, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(250, 245, 250)
        doc.rect(mx, y - 11, cw, 20, 'F')
      }
      const qty = Number(item?.quantity || 0)
      const price = Number(item?.price || 0)
      const lineTotal = qty * price
      subtotal += lineTotal

      const nameLine = doc.splitTextToSize(String(item?.name || 'Producto'), cw - 155)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(...C.text)
      doc.text(nameLine, mx + 8, y)

      doc.setFontSize(9)
      doc.setTextColor(...C.soft)
      doc.text(`x${qty}`, W - mx - 90, y, { align: 'right' })

      doc.setTextColor(...C.text)
      doc.text(`$${lineTotal.toFixed(2)}`, W - mx - 4, y, { align: 'right' })

      y += Math.max(20, nameLine.length * 14)
    })

    // Total row
    y += 4
    doc.setDrawColor(...C.pinkBorder)
    doc.setLineWidth(0.8)
    doc.line(mx, y, mx + cw, y)
    y += 2
    doc.setFillColor(...C.pinkSoft)
    doc.rect(mx, y, cw, 26, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...C.pinkDark)
    doc.text('Total', W - mx - 90, y + 16, { align: 'right' })
    doc.setFontSize(11)
    doc.setTextColor(...C.text)
    doc.text(
      `$${Number(receiptData.amount || subtotal).toFixed(2)} ${receiptData.currency || 'MXN'}`,
      W - mx - 4,
      y + 16,
      { align: 'right' }
    )

    // ── FOOTER ─────────────────────────────────────────────────────
    const footerY = H - 50
    doc.setDrawColor(...C.pinkBorder)
    doc.setLineWidth(0.8)
    doc.line(mx, footerY, mx + cw, footerY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...C.light)
    doc.text(
      'Conserva este documento para cualquier aclaracion.',
      W / 2, footerY + 13, { align: 'center' }
    )
    doc.text(
      'Studio D Flori \u00b7 WhatsApp: +52 33 1025 9546 \u00b7 Lun\u2013Sab 9:00\u201318:00',
      W / 2, footerY + 25, { align: 'center' }
    )
    doc.setFontSize(7.5)
    doc.text(
      `Emitido: ${new Date().toLocaleString('es-MX')}`,
      W / 2, footerY + 38, { align: 'center' }
    )

    const safePaymentId = String(receiptData.paymentId || 'sin-folio').replace(/[^a-zA-Z0-9-_]/g, '')
    doc.save(`comprobante-${safePaymentId}.pdf`)
  }

  const paymentSharedProps = {
    orderId: orderIdRef.current,
    apiBaseUrl,
    mpPublicKey,
    stripePublishableKey,
    payableAmount,
    items,
    hasApprovedPayment,
    deliveryDetails: normalizedDeliveryDetails,
    selectedDeliveryCity,
    selectedDeliveryDate,
    selectedDeliveryTime,
    onPaymentApproved: handlePaymentApproved
  }

  return (
    <section className="tarjeta" aria-label="Pago con tarjeta">
      <header className="tarjeta__header">
        <h2 className="tarjeta__title">{hasApprovedPayment ? 'Pago completado' : 'Pagar con tarjeta'}</h2>
      </header>

      <p className="tarjeta__secure-note">
        {hasApprovedPayment
          ? 'Tu pago fue aprobado correctamente. Ya puedes descargar tu comprobante en PDF.'
          : 'Completa tu pago con Mercado Pago sin salir de esta pagina.'}
      </p>
      {!hasApprovedPayment && paymentProviders.length > 1 && (
        <div className="tarjeta__provider-switch" role="radiogroup" aria-label="Proveedor de pago">
          {paymentProviders.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className={`tarjeta__provider-option ${paymentProvider === provider.id ? 'tarjeta__provider-option--active' : ''}`}
              onClick={() => setPaymentProvider(provider.id)}
              aria-pressed={paymentProvider === provider.id}
            >
              {provider.label}
            </button>
          ))}
        </div>
      )}
      {!hasApprovedPayment && (
        <div className="tarjeta__brands" aria-label="Tarjetas aceptadas">
          <span className="tarjeta__brands-label">Tarjetas aceptadas:</span>
          <ul className="tarjeta__brands-list">
            <li className="tarjeta__brand">Visa</li>
            <li className="tarjeta__brand">Mastercard</li>
            <li className="tarjeta__brand">American Express</li>
          </ul>
        </div>
      )}
      <p className="tarjeta__meta">
        {hasApprovedPayment ? 'Total pagado:' : 'Total a pagar:'} ${displayedAmount.toFixed(2)} MXN
      </p>

      <div className="tarjeta__summary">
        <p className="tarjeta__summary-text">{selectedProvider.summary}</p>
      </div>

      <PaymentProviderBoundary providerKey={paymentProvider}>
        <SelectedPaymentComponent key={paymentProvider} {...paymentSharedProps} />
      </PaymentProviderBoundary>

      <div className="tarjeta__actions">
        {receiptData && (
          <button type="button" className="tarjeta__button" onClick={downloadReceiptPdf}>
            Descargar comprobante PDF
          </button>
        )}
        <button type="button" className="tarjeta__button tarjeta__button--secondary" onClick={backToPaymentForm}>
          Volver
        </button>
      </div>
    </section>
  )
}

export default Tarjeta
