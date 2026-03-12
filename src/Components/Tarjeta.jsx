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

    // Mercado Pago webhook is the source of truth for persistence and PDF generation.
    if (String(approvedPayload?.provider || paymentProvider) !== 'mercadopago') {
      fetch(`${apiBaseUrl}/api/comprobantes/confirm-paid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: Number(approvedPayload?.amount ?? basePayload.amount),
          approvedAt: approvedPayload?.approvedAt || basePayload.approvedAt,
          items: basePayload.items,
          deliveryDetails: basePayload.deliveryDetails,
          selectedDeliveryCity: basePayload.selectedDeliveryCity,
          selectedDeliveryDate: basePayload.selectedDeliveryDate,
          selectedDeliveryTime: basePayload.selectedDeliveryTime
        })
      }).catch((error) => {
        console.warn('No se pudo guardar comprobante en Supabase:', error?.message || error)
      })
    }

    clearCart()
  }

  const downloadReceiptPdf = async () => {
    if (!receiptData) {
      return
    }

    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const marginX = 34
    const contentWidth = pageWidth - (marginX * 2)
    let cursorY = 38
    const colors = {
      accent: [248, 148, 244],
      accentSoft: [255, 241, 253],
      accentBorder: [239, 183, 234],
      text: [47, 33, 48],
      textSoft: [124, 93, 120],
      white: [255, 255, 255]
    }

    const drawSectionTitle = (title) => {
      doc.setFillColor(...colors.accent)
      doc.roundedRect(marginX, cursorY, contentWidth, 24, 6, 6, 'F')
      doc.setTextColor(...colors.text)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text(String(title), marginX + 10, cursorY + 16)
      cursorY += 34
      doc.setTextColor(...colors.text)
    }

    const writeLine = (text, options = {}) => {
      const fontSize = options.fontSize || 10.5
      const maxWidth = options.maxWidth || (contentWidth - 16)
      doc.setFont('helvetica', options.bold ? 'bold' : 'normal')
      doc.setFontSize(fontSize)
      const lines = doc.splitTextToSize(String(text || ''), maxWidth)
      doc.text(lines, marginX + 8, cursorY)
      cursorY += (lines.length * (fontSize + 3))
    }

    const drawCard = (height) => {
      doc.setFillColor(...colors.accentSoft)
      doc.setDrawColor(...colors.accentBorder)
      doc.roundedRect(marginX, cursorY - 14, contentWidth, height, 8, 8, 'FD')
    }

    try {
      const logoImage = await loadImage(logoBien)
      doc.addImage(logoImage, 'JPEG', marginX, cursorY, 52, 52)
    } catch {
      // If logo cannot load for any reason, continue with textual header.
    }

    doc.setTextColor(...colors.text)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    doc.text('Comprobante de pago', marginX + 62, cursorY + 20)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text('Studio dei Fiori', marginX + 62, cursorY + 38)
    cursorY += 66

    const fulfillmentType = receiptData.deliveryDetails?.fulfillmentType === 'pickup'
      ? 'Recoger en tienda'
      : 'Entrega a domicilio'
    const orderNumber = receiptData.orderId || 'N/A'

    drawSectionTitle('Pago confirmado')
    drawCard(118)
    writeLine(`No. de orden: ${orderNumber}`, { bold: true })
    writeLine(`Folio de pago: ${receiptData.paymentId || 'N/A'}`)
    writeLine(`Proveedor: ${receiptData.provider || 'N/A'}`)
    writeLine(`Origen de registro: ${receiptData.provider === 'mercadopago' ? 'Webhook Mercado Pago' : 'Confirmacion directa'}`)
    writeLine(`Fecha: ${new Date(receiptData.approvedAt || Date.now()).toLocaleString('es-MX')}`)
    writeLine(`Total pagado: $${Number(receiptData.amount || 0).toFixed(2)} ${receiptData.currency || 'MXN'}`)
    cursorY += 14

    drawSectionTitle('Datos del cliente')
    drawCard(72)
    writeLine(`Nombre: ${receiptData.deliveryDetails?.fullName || 'N/A'}`)
    writeLine(`Telefono: ${receiptData.deliveryDetails?.phone || 'N/A'}`)
    cursorY += 14

    drawSectionTitle('Entrega')
    drawCard(fulfillmentType !== 'Recoger en tienda' ? 148 : 106)
    writeLine(`Tipo: ${fulfillmentType}`)
    writeLine(`Recibe: ${receiptData.deliveryDetails?.recipientType === 'other'
      ? (receiptData.deliveryDetails?.recipientName || 'Otra persona')
      : 'El comprador'}`)
    writeLine(`Fecha de entrega: ${receiptData.selectedDeliveryDate || 'N/A'}`)
    writeLine(`Horario deseado: ${receiptData.selectedDeliveryTime || 'N/A'}`)

    if (fulfillmentType !== 'Recoger en tienda') {
      writeLine(`Ciudad: ${receiptData.selectedDeliveryCity || 'N/A'}`)
      writeLine(`Direccion: ${receiptData.deliveryDetails?.streetAddress || 'N/A'}`)
      writeLine(`Colonia: ${receiptData.deliveryDetails?.neighborhood || 'N/A'}`)
      writeLine(`Codigo postal: ${receiptData.deliveryDetails?.postalCode || 'N/A'}`)
    }

    if (receiptData.deliveryDetails?.flowerMessage) {
      writeLine(`Mensaje para la flor: ${receiptData.deliveryDetails.flowerMessage}`)
    }

    if (receiptData.deliveryDetails?.specialInstructions) {
      writeLine(`Instrucciones: ${receiptData.deliveryDetails.specialInstructions}`)
    }
    cursorY += 14

    drawSectionTitle('Productos')
    const products = receiptData.items || []
    drawCard(Math.max(70, 26 + (products.length * 18)))
    products.forEach((item) => {
      const quantity = Number(item?.quantity || 0)
      const price = Number(item?.price || 0)
      writeLine(`- ${item?.name || 'Producto'} x${quantity} - $${(price * quantity).toFixed(2)} MXN`)
    })

    const pageHeight = doc.internal.pageSize.getHeight()
    const footerY = pageHeight - 58
    doc.setDrawColor(...colors.accentBorder)
    doc.line(marginX, footerY - 14, marginX + contentWidth, footerY - 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...colors.textSoft)
    doc.text('Comprobante digital de Studio D Flori. Conserva este documento para cualquier aclaracion.', marginX, footerY)
    doc.text('Horario de atencion: Lunes a Sabado de 9:00 a 18:00. WhatsApp: +52 33 1025 9546', marginX, footerY + 12)
    doc.text(`Emitido: ${new Date().toLocaleString('es-MX')}`, marginX, footerY + 24)

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
