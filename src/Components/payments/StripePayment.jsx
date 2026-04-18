import { useEffect, useRef, useState } from 'react'

const STRIPE_SDK_URL = 'https://js.stripe.com/v3/'
const STRIPE_CARD_NUMBER_CONTAINER_ID = 'stripe-card-number-element'
const STRIPE_CARD_EXPIRY_CONTAINER_ID = 'stripe-card-expiry-element'
const STRIPE_CARD_CVC_CONTAINER_ID = 'stripe-card-cvc-element'

const BRAND_LABELS = {
  visa:       'VISA',
  mastercard: 'MC',
  amex:       'AMEX'
}
const PAYMENT_REQUEST_TIMEOUT_MS = 30000

let stripeScriptPromise = null

function withTimeout(promiseFactory, timeoutMs = PAYMENT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  return promiseFactory(controller.signal)
    .finally(() => {
      window.clearTimeout(timeoutId)
    })
}

function getStripeStatusMessage(status) {
  const normalizedStatus = String(status || '').trim().toLowerCase()

  if (normalizedStatus === 'processing' || normalizedStatus === 'requires_capture') {
    return {
      type: 'info',
      message: 'Tu pago esta en proceso. Te confirmaremos cuando Stripe lo acredite.'
    }
  }

  if (normalizedStatus === 'requires_payment_method') {
    return {
      type: 'error',
      message: 'Tu tarjeta fue rechazada o requiere otro metodo de pago. Intenta con otra tarjeta.'
    }
  }

  if (normalizedStatus === 'canceled') {
    return {
      type: 'error',
      message: 'El pago fue cancelado. Intenta nuevamente si deseas completar tu compra.'
    }
  }

  if (normalizedStatus === 'requires_action') {
    return {
      type: 'error',
      message: 'El banco requiere una validacion adicional. Intenta nuevamente para completar la autenticacion.'
    }
  }

  return {
    type: 'error',
    message: `Estado de pago no esperado: ${normalizedStatus || 'sin estado'}`
  }
}

function ensureStripeSdk() {
  if (window.Stripe) return Promise.resolve()
  if (stripeScriptPromise) return stripeScriptPromise

  stripeScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${STRIPE_SDK_URL}"]`)
    if (existingScript) {
      if (window.Stripe) { resolve(); return }
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar Stripe SDK')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = STRIPE_SDK_URL
    script.async = true
    script.onload = () => { script.dataset.loaded = 'true'; resolve() }
    script.onerror = () => reject(new Error('No se pudo cargar Stripe SDK'))
    document.body.appendChild(script)
  })

  return stripeScriptPromise
}

function StripePayment({
  orderId,
  apiBaseUrl,
  stripePublishableKey,
  payableAmount,
  items,
  deliveryDetails,
  selectedDeliveryCity,
  selectedDeliveryDate,
  selectedDeliveryTime,
  onPaymentApproved
}) {
  const [stripeSdkReady, setStripeSdkReady] = useState(Boolean(window.Stripe))
  const [isLoading, setIsLoading] = useState(false)
  const [isStripePaying, setIsStripePaying] = useState(false)
  const [stripeCardholderName, setStripeCardholderName] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [paymentMessage, setPaymentMessage] = useState('')
  const [cardBrand, setCardBrand] = useState('unknown')

  const stripeRef = useRef(null)
  const stripeElementsRef = useRef(null)
  const stripeCardNumberRef = useRef(null)
  const stripeCardExpiryRef = useRef(null)
  const stripeCardCvcRef = useRef(null)

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    ensureStripeSdk()
      .then(() => { if (isMounted) { setStripeSdkReady(true); setErrorMessage('') } })
      .catch(() => { if (isMounted) { setStripeSdkReady(false); setErrorMessage('No se pudo cargar Stripe. Recarga la pagina e intenta de nuevo.') } })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => {
      isMounted = false
      if (!window.Stripe) stripeScriptPromise = null
    }
  }, [])

  useEffect(() => {
    if (!stripeSdkReady || !stripePublishableKey || items.length === 0 || payableAmount <= 0) return

    try {
      setIsLoading(true)
      if (typeof window.Stripe !== 'function') throw new Error('Stripe SDK no esta disponible')

      const stripeInstance = window.Stripe(stripePublishableKey, { locale: 'es' })
      stripeRef.current = stripeInstance
      stripeElementsRef.current = stripeRef.current.elements()

      if (stripeCardNumberRef.current) { try { stripeCardNumberRef.current.destroy() } catch { /**/ } }
      if (stripeCardExpiryRef.current) { try { stripeCardExpiryRef.current.destroy() } catch { /**/ } }
      if (stripeCardCvcRef.current)    { try { stripeCardCvcRef.current.destroy() } catch { /**/ } }

      const baseStyle = {
        style: {
          base: {
            color: '#2e2e2e',
            fontFamily: '"Nunito Sans", sans-serif',
            fontSize: '18px',
            '::placeholder': { color: '#8f7e69' }
          },
          invalid: { color: '#933b27' }
        }
      }

      stripeCardNumberRef.current = stripeElementsRef.current.create('cardNumber', { ...baseStyle, disableLink: true })
      stripeCardExpiryRef.current = stripeElementsRef.current.create('cardExpiry', baseStyle)
      stripeCardCvcRef.current    = stripeElementsRef.current.create('cardCvc', baseStyle)

      const numberEl  = document.getElementById(STRIPE_CARD_NUMBER_CONTAINER_ID)
      const expiryEl  = document.getElementById(STRIPE_CARD_EXPIRY_CONTAINER_ID)
      const cvcEl     = document.getElementById(STRIPE_CARD_CVC_CONTAINER_ID)
      if (!numberEl || !expiryEl || !cvcEl) throw new Error('No se encontro el contenedor de Stripe en el DOM')

      stripeCardNumberRef.current.mount(`#${STRIPE_CARD_NUMBER_CONTAINER_ID}`)
      stripeCardExpiryRef.current.mount(`#${STRIPE_CARD_EXPIRY_CONTAINER_ID}`)
      stripeCardCvcRef.current.mount(`#${STRIPE_CARD_CVC_CONTAINER_ID}`)

      stripeCardNumberRef.current.on('ready', () => setIsLoading(false))

      stripeCardNumberRef.current.on('change', (event) => {
        setCardBrand(event?.brand || 'unknown')
        setErrorMessage(event?.error?.message || '')
      })
    } catch (error) {
      setErrorMessage(error?.message || 'No se pudo iniciar Stripe')
      setIsLoading(false)
    }

    return () => {
      if (stripeCardNumberRef.current) { try { stripeCardNumberRef.current.destroy() } catch { /**/ } stripeCardNumberRef.current = null }
      if (stripeCardExpiryRef.current) { try { stripeCardExpiryRef.current.destroy() } catch { /**/ } stripeCardExpiryRef.current = null }
      if (stripeCardCvcRef.current)    { try { stripeCardCvcRef.current.destroy() } catch { /**/ } stripeCardCvcRef.current = null }
      stripeElementsRef.current = null
      stripeRef.current = null
      setCardBrand('unknown')
    }
  }, [stripeSdkReady, stripePublishableKey, items, payableAmount])

  const handleStripePayment = async () => {
    try {
      if (isStripePaying || !stripeRef.current || !stripeCardNumberRef.current || payableAmount <= 0) {
        if (!stripeRef.current) setErrorMessage('Stripe no esta listo para procesar el pago')
        return
      }
      setIsStripePaying(true)
      setErrorMessage('')
      setPaymentMessage('')

      const isStorePickup = deliveryDetails.fulfillmentType === 'pickup'
      const createIntentResponse = await withTimeout((signal) => fetch(`${apiBaseUrl}/api/stripe/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          orderId,
          amount: payableAmount,
          currency: 'mxn',
          items,
          customer: {
            fullName: deliveryDetails.fullName,
            phone: deliveryDetails.phone,
            email: ''
          },
          delivery: {
            fulfillmentType: deliveryDetails.fulfillmentType || 'delivery',
            city: isStorePickup ? null : selectedDeliveryCity,
            date: selectedDeliveryDate,
            time: selectedDeliveryTime,
            recipientType: deliveryDetails.recipientType || 'self',
            recipientName: deliveryDetails.recipientType === 'other' ? deliveryDetails.recipientName : null,
            streetAddress: isStorePickup ? null : deliveryDetails.streetAddress,
            neighborhood: isStorePickup ? null : deliveryDetails.neighborhood,
            postalCode: isStorePickup ? null : deliveryDetails.postalCode,
            flowerMessage: deliveryDetails.flowerMessage,
            specialInstructions: deliveryDetails.specialInstructions
          }
        })
      }))

      let createIntentPayload = null
      try { createIntentPayload = await createIntentResponse.json() } catch {
        throw new Error(`Respuesta invalida del servidor (${createIntentResponse.status})`)
      }
      if (!createIntentResponse.ok) {
        throw new Error(createIntentPayload?.error || 'No se pudo inicializar el pago en Stripe')
      }

      const result = await stripeRef.current.confirmCardPayment(createIntentPayload.clientSecret, {
        payment_method: {
          card: stripeCardNumberRef.current,
          billing_details: {
            name: String(stripeCardholderName || deliveryDetails.fullName || '').trim() || undefined,
            phone: String(deliveryDetails.phone || '').trim() || undefined
          }
        }
      })

      if (result.error) throw new Error(result.error.message || 'Stripe rechazo el pago')

      const status = result.paymentIntent?.status
      if (status === 'succeeded') {
        setPaymentMessage('Pago aprobado. Tu pedido fue registrado correctamente.')
        const paymentIntentId = result.paymentIntent?.id || ''
        if (paymentIntentId) {
          void withTimeout((signal) => fetch(`${apiBaseUrl}/api/stripe/process-succeeded-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
              paymentIntentId,
              orderId
            })
          })).then(async (response) => {
            if (!response.ok) {
              const payload = await response.json().catch(() => ({}))
              console.warn('Fallback post-pago Stripe incompleto:', payload?.error || response.status)
            }
          }).catch((error) => {
            console.warn('No se pudo iniciar fallback post-pago Stripe:', error?.message || error)
          })
        }
        onPaymentApproved?.({
          provider: 'stripe',
          paymentId: paymentIntentId,
          approvedAt: new Date().toISOString(),
          amount: payableAmount,
          currency: String(result.paymentIntent?.currency || 'mxn').toUpperCase()
        })
        return
      }
      if (status === 'processing' || status === 'requires_capture') {
        setPaymentMessage('Tu pago esta en proceso. Te confirmaremos cuando Stripe lo acredite.')
        return
      }
      const statusResolution = getStripeStatusMessage(status)
      if (statusResolution.type === 'info') {
        setPaymentMessage(statusResolution.message)
        return
      }
      throw new Error(statusResolution.message)
    } catch (error) {
      const isAbort = error?.name === 'AbortError'
      setErrorMessage(
        isAbort
          ? 'Stripe tardo demasiado en responder. Revisa si el cargo se genero antes de intentar nuevamente.'
          : (error?.message || 'No se pudo procesar el pago con Stripe')
      )
    } finally {
      setIsStripePaying(false)
    }
  }

  if (!stripePublishableKey) {
    return <p className="tarjeta__error">Falta configurar VITE_STRIPE_PUBLISHABLE_KEY para usar Stripe.</p>
  }

  if (payableAmount <= 0) return null

  return (
    <>
      <div className="tarjeta__stripe-wrap">
        <div className="tarjeta__stripe-brick">
          <div className="tarjeta__stripe-head">
            <h3 className="tarjeta__stripe-title">Tarjeta de credito o debito</h3>
            <ul className="tarjeta__stripe-brands" aria-label="Marcas de tarjeta aceptadas">
              {Object.entries(BRAND_LABELS).map(([key, label]) => (
                <li
                  key={key}
                  className={`tarjeta__stripe-brand ${cardBrand === key ? 'tarjeta__stripe-brand--active' : cardBrand !== 'unknown' ? 'tarjeta__stripe-brand--dim' : ''}`}
                >
                  {label}
                </li>
              ))}
            </ul>
          </div>
          <label className="tarjeta__field">
            <span className="tarjeta__label">Numero de tarjeta</span>
            <div id={STRIPE_CARD_NUMBER_CONTAINER_ID} className="tarjeta__stripe-input" />
          </label>
          <div className="tarjeta__stripe-row">
            <label className="tarjeta__field">
              <span className="tarjeta__label">Vencimiento</span>
              <div id={STRIPE_CARD_EXPIRY_CONTAINER_ID} className="tarjeta__stripe-input" />
            </label>
            <label className="tarjeta__field">
              <span className="tarjeta__label">Codigo de seguridad</span>
              <div id={STRIPE_CARD_CVC_CONTAINER_ID} className="tarjeta__stripe-input" />
            </label>
          </div>
          <label className="tarjeta__field">
            <span className="tarjeta__label">Nombre del titular como aparece en la tarjeta</span>
            <input
              className="tarjeta__input"
              type="text"
              value={stripeCardholderName}
              onChange={(e) => setStripeCardholderName(e.target.value)}
              placeholder="Nombre completo"
              autoComplete="cc-name"
            />
          </label>
        </div>
        <button
          type="button"
          className="tarjeta__button"
          onClick={handleStripePayment}
          disabled={isStripePaying || isLoading || items.length === 0}
        >
          {isStripePaying ? 'Procesando...' : 'Pagar con Stripe'}
        </button>
      </div>
      {errorMessage && <p className="tarjeta__error">{errorMessage}</p>}
      {paymentMessage && <p className="tarjeta__success">{paymentMessage}</p>}
      {isLoading && !isStripePaying && <span className="tarjeta__loading">Cargando formulario...</span>}
      {isStripePaying && <span className="tarjeta__loading">Procesando pago, no cierres esta pagina...</span>}
    </>
  )
}

export default StripePayment
