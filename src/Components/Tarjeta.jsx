import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Tarjeta.css'
import { useCart } from '../context/CartContext'
import { PAYMENT_RECEIPT_STORAGE_KEY } from '../constants/paymentReceiptStorage.js'
import { defaultPaymentProvider, getPaymentProvider, paymentProviders } from './payments'
import PaymentProviderBoundary from './payments/PaymentProviderBoundary'

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function createOrderId() {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

const STORED_RECEIPT_TTL_MS = 2 * 60 * 60 * 1000
const STRIPE_RECEIPT_FALLBACK_ATTEMPT = 3

function buildCartFingerprint(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return ''
  }

  return JSON.stringify(
    items
      .map((item) => ({
        id: String(item?.id || '').trim(),
        price: Number.isFinite(Number(item?.price)) ? Number(Number(item.price).toFixed(2)) : 0,
        quantity: Number(item?.quantity || 0)
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  )
}

function resolveApiBaseUrl() {
  const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '')
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '')
  }

  return 'http://localhost:3001'
}

function readStoredReceipt(currentItems = []) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.sessionStorage.getItem(PAYMENT_RECEIPT_STORAGE_KEY)
    if (!rawValue) {
      return null
    }
    const parsedValue = JSON.parse(rawValue)
    if (!parsedValue || typeof parsedValue !== 'object') {
      return null
    }

    const storedReceipt = parsedValue.receiptData && typeof parsedValue.receiptData === 'object'
      ? parsedValue.receiptData
      : parsedValue
    if (!storedReceipt || typeof storedReceipt !== 'object') {
      return null
    }

    const storedAt = Number(parsedValue.storedAt || storedReceipt.storedAt || 0)
    if (storedAt && Date.now() - storedAt > STORED_RECEIPT_TTL_MS) {
      return null
    }

    const currentFingerprint = buildCartFingerprint(currentItems)
    const storedFingerprint = String(
      parsedValue.cartFingerprint
      || storedReceipt.cartFingerprint
      || buildCartFingerprint(storedReceipt.items)
      || ''
    )
    if (currentFingerprint && storedFingerprint && currentFingerprint !== storedFingerprint) {
      return null
    }

    return storedReceipt
  } catch {
    return null
  }
}

function buildReceiptEndpointUrl(apiBaseUrl, receiptData, endpoint) {
  const paymentId = String(receiptData?.paymentId || '').trim()
  const orderId = String(receiptData?.orderId || '').trim()

  if (!apiBaseUrl || !paymentId || !orderId) {
    return ''
  }

  const params = new URLSearchParams({ orderId })
  return `${apiBaseUrl}/api/comprobantes/${encodeURIComponent(paymentId)}/${endpoint}?${params.toString()}`
}

function Tarjeta() {
  const navigate = useNavigate()
  useEffect(() => {
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const {
    items,
    itemsForPayment,
    totalWithDelivery,
    backToPaymentForm,
    closePaymentView,
    clearCart,
    deliveryDetails,
    selectedDeliveryCity,
    selectedDeliveryDate,
    selectedDeliveryTime
  } = useCart()

  const apiBaseUrl = resolveApiBaseUrl()
  const mpPublicKey = String(import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY || '').trim()
  const stripePublishableKey = String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim()
  const payableAmount = Number(totalWithDelivery.toFixed(2))
  const [paymentProvider, setPaymentProvider] = useState(defaultPaymentProvider)
  const [paymentState, setPaymentState] = useState(() => {
    const storedReceipt = readStoredReceipt(items)
    return {
      orderId: storedReceipt?.orderId || createOrderId(),
      receiptData: storedReceipt
    }
  })
  const { orderId, receiptData } = paymentState
  const [receiptStatus, setReceiptStatus] = useState(receiptData ? 'checking' : 'idle')
  const [receiptStatusMessage, setReceiptStatusMessage] = useState('')

  const selectedProvider = useMemo(
    () => getPaymentProvider(paymentProvider),
    [paymentProvider]
  )
  const hasApprovedPayment = Boolean(receiptData)
  const displayedAmount = Number((receiptData?.amount ?? payableAmount) || 0)
  const receiptPdfUrl = useMemo(
    () => buildReceiptEndpointUrl(apiBaseUrl, receiptData, 'pdf'),
    [apiBaseUrl, receiptData]
  )
  const receiptStatusUrl = useMemo(
    () => buildReceiptEndpointUrl(apiBaseUrl, receiptData, 'status'),
    [apiBaseUrl, receiptData]
  )
  const canOpenReceiptPdf = Boolean(receiptPdfUrl) && (receiptStatus === 'ready' || receiptStatus === 'error')
  const receiptButtonText = receiptStatus === 'ready'
    ? 'Abrir comprobante PDF'
    : receiptStatus === 'error'
      ? 'Intentar abrir comprobante PDF'
      : 'Preparando comprobante PDF...'

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

  const setReceiptData = (nextReceiptData) => {
    setPaymentState((current) => ({
      orderId: nextReceiptData?.orderId || current.orderId,
      receiptData: nextReceiptData
    }))
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (receiptData) {
      window.sessionStorage.setItem(PAYMENT_RECEIPT_STORAGE_KEY, JSON.stringify({
        storedAt: Date.now(),
        cartFingerprint: buildCartFingerprint(receiptData.items) || buildCartFingerprint(items),
        receiptData
      }))
      return
    }

    window.sessionStorage.removeItem(PAYMENT_RECEIPT_STORAGE_KEY)
  }, [items, receiptData])

  useEffect(() => {
    if (!receiptData) {
      return undefined
    }

    if (!receiptStatusUrl) {
      const errorTimer = window.setTimeout(() => {
        setReceiptStatus('error')
        setReceiptStatusMessage('No se pudo preparar el enlace del comprobante.')
      }, 0)
      return () => window.clearTimeout(errorTimer)
    }

    let isCancelled = false
    let retryTimer = null
    const maxAttempts = 8
    let stripeFallbackStarted = false

    async function runStripeReceiptFallback() {
      if (
        stripeFallbackStarted
        || receiptData?.provider !== 'stripe'
        || !receiptData?.paymentId
        || !receiptData?.orderId
      ) {
        return
      }

      stripeFallbackStarted = true

      try {
        const response = await fetch(`${apiBaseUrl}/api/stripe/process-succeeded-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentIntentId: receiptData.paymentId,
            orderId: receiptData.orderId
          })
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          console.warn('Fallback post-pago Stripe incompleto:', payload?.error || response.status)
        }
      } catch (error) {
        console.warn('No se pudo iniciar fallback post-pago Stripe:', error?.message || error)
      }
    }

    async function checkReceiptStatus(attempt = 0) {
      try {
        setReceiptStatus(attempt === 0 ? 'checking' : 'pending')
        setReceiptStatusMessage(
          attempt === 0
            ? 'Preparando comprobante PDF...'
            : 'El comprobante sigue preparandose, espera unos segundos.'
        )

        const response = await fetch(receiptStatusUrl)
        const payload = await response.json().catch(() => ({}))

        if (isCancelled) {
          return
        }

        if (!response.ok && response.status !== 202) {
          setReceiptStatus('error')
          setReceiptStatusMessage(payload?.error || 'No se pudo consultar el comprobante. Intenta abrirlo de nuevo en unos segundos.')
          return
        }

        if (payload?.ready) {
          setReceiptStatus('ready')
          setReceiptStatusMessage('Comprobante listo. Puedes abrirlo en PDF.')
          return
        }

        if (attempt >= STRIPE_RECEIPT_FALLBACK_ATTEMPT) {
          void runStripeReceiptFallback()
        }

        if (attempt < maxAttempts) {
          retryTimer = window.setTimeout(() => checkReceiptStatus(attempt + 1), 1500)
          return
        }

        setReceiptStatus('error')
        setReceiptStatusMessage('El comprobante esta tardando mas de lo normal. Intenta abrirlo de nuevo en unos segundos.')
      } catch {
        if (isCancelled) {
          return
        }

        setReceiptStatus('error')
        setReceiptStatusMessage('No se pudo consultar el comprobante. Revisa tu conexion e intenta de nuevo.')
      }
    }

    checkReceiptStatus()

    return () => {
      isCancelled = true
      if (retryTimer) {
        window.clearTimeout(retryTimer)
      }
    }
  }, [receiptData, receiptStatusUrl])

  const handlePaymentApproved = (approvedPayload = {}) => {
    const now = new Date()
    const basePayload = {
      orderId,
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
  }

  const handleExitAfterPayment = () => {
    setReceiptData(null)
    clearCart()
    closePaymentView()
    navigate('/', { replace: true })
  }

  const paymentSharedProps = {
    orderId,
    apiBaseUrl,
    mpPublicKey,
    stripePublishableKey,
    payableAmount,
    items: itemsForPayment,
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
          ? 'Tu pago fue aprobado correctamente. Ya puedes abrir tu comprobante en PDF.'
          : selectedProvider.summary}
      </p>

      {!hasApprovedPayment && paymentProviders.length > 1 && (
        <div className="tarjeta__provider-switch" role="radiogroup" aria-label="Proveedor de pago">
          {paymentProviders.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className={`tarjeta__provider-option tarjeta__provider-option--${provider.id} ${paymentProvider === provider.id ? 'tarjeta__provider-option--active' : ''}`}
              onClick={() => setPaymentProvider(provider.id)}
              aria-pressed={paymentProvider === provider.id}
            >
              {provider.id === 'stripe' && (
                <span className="tarjeta__stripe-badge" aria-hidden="true">S</span>
              )}
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

      {receiptData && (
        <div className="tarjeta__receipt-info" role="status" aria-live="polite">
          <p className="tarjeta__receipt-title">Tu compra ya fue aprobada.</p>
          <p className="tarjeta__receipt-text">
            Guarda este numero por si necesitas ayuda con tu pedido o comprobante.
          </p>
          <dl className="tarjeta__receipt-list">
            <div className="tarjeta__receipt-row">
              <dt>No. de orden</dt>
              <dd>{receiptData.orderId || orderId}</dd>
            </div>
            {receiptData.paymentId && (
              <div className="tarjeta__receipt-row">
                <dt>Folio de pago</dt>
                <dd>{receiptData.paymentId}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="tarjeta__summary">
        <p className="tarjeta__summary-text">
          {hasApprovedPayment
            ? 'Tu comprobante se abrira como PDF desde el servidor para que funcione en iPhone, Android y ordenador.'
            : selectedProvider.summary}
        </p>
      </div>

      {!hasApprovedPayment && (
        <PaymentProviderBoundary providerKey={paymentProvider}>
          <SelectedPaymentComponent key={paymentProvider} {...paymentSharedProps} />
        </PaymentProviderBoundary>
      )}

      {receiptData && receiptStatusMessage && (
        <p className={receiptStatus === 'error' ? 'tarjeta__error' : 'tarjeta__success'}>
          {receiptStatusMessage}
        </p>
      )}

      <div className="tarjeta__actions">
        {receiptData && (
          <a
            className={`tarjeta__button${canOpenReceiptPdf ? '' : ' tarjeta__button--disabled'}`}
            href={canOpenReceiptPdf ? receiptPdfUrl : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!canOpenReceiptPdf}
            onClick={(event) => {
              if (!canOpenReceiptPdf) {
                event.preventDefault()
              }
            }}
          >
            {receiptButtonText}
          </a>
        )}
        <button
          type="button"
          className="tarjeta__button tarjeta__button--secondary"
          onClick={hasApprovedPayment ? handleExitAfterPayment : backToPaymentForm}
        >
          {hasApprovedPayment ? 'Volver al catalogo' : 'Volver'}
        </button>
      </div>
    </section>
  )
}

export default Tarjeta
