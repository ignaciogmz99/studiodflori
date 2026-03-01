import { useEffect, useRef, useState } from 'react'

const STRIPE_SDK_URL = 'https://js.stripe.com/v3/'
const STRIPE_CARD_NUMBER_CONTAINER_ID = 'stripe-card-number-element'
const STRIPE_CARD_EXPIRY_CONTAINER_ID = 'stripe-card-expiry-element'
const STRIPE_CARD_CVC_CONTAINER_ID = 'stripe-card-cvc-element'

let stripeScriptPromise = null

function ensureStripeSdk() {
  if (window.Stripe) {
    return Promise.resolve()
  }

  if (stripeScriptPromise) {
    return stripeScriptPromise
  }

  stripeScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${STRIPE_SDK_URL}"]`)

    if (existingScript) {
      if (window.Stripe) {
        resolve()
        return
      }

      const alreadyLoaded = existingScript.dataset.loaded === 'true'
      if (alreadyLoaded) {
        const maxTries = 30
        let tries = 0
        const timer = setInterval(() => {
          if (window.Stripe) {
            clearInterval(timer)
            resolve()
            return
          }

          tries += 1
          if (tries >= maxTries) {
            clearInterval(timer)
            reject(new Error('Stripe SDK no quedo disponible despues de cargar el script'))
          }
        }, 50)
        return
      }

      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar Stripe SDK')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = STRIPE_SDK_URL
    script.async = true
    script.onload = () => {
      script.dataset.loaded = 'true'
      resolve()
    }
    script.onerror = () => reject(new Error('No se pudo cargar Stripe SDK'))
    document.body.appendChild(script)
  })

  return stripeScriptPromise
}

function StripePayment({
  apiBaseUrl,
  stripePublishableKey,
  payableAmount,
  items,
  customerEmail,
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
  const stripeRef = useRef(null)
  const stripeElementsRef = useRef(null)
  const stripeCardNumberRef = useRef(null)
  const stripeCardExpiryRef = useRef(null)
  const stripeCardCvcRef = useRef(null)

  useEffect(() => {
    let isMounted = true

    setIsLoading(true)
    ensureStripeSdk()
      .then(() => {
        if (!isMounted) {
          return
        }
        setStripeSdkReady(true)
        setErrorMessage('')
      })
      .catch(() => {
        if (!isMounted) {
          return
        }
        setStripeSdkReady(false)
        setErrorMessage('No se pudo cargar Stripe. Recarga la pagina e intenta de nuevo.')
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!stripeSdkReady || !stripePublishableKey || items.length === 0 || payableAmount <= 0) {
      return
    }

    try {
      setIsLoading(true)
      if (typeof window.Stripe !== 'function') {
        throw new Error('Stripe SDK no esta disponible en la ventana global')
      }

      const stripeInstance = window.Stripe(stripePublishableKey, { locale: 'es' })
      if (!stripeInstance) {
        throw new Error('No se pudo inicializar Stripe con la llave publica configurada')
      }

      stripeRef.current = stripeInstance
      stripeElementsRef.current = stripeRef.current.elements()

      if (stripeCardNumberRef.current) {
        stripeCardNumberRef.current.destroy()
      }
      if (stripeCardExpiryRef.current) {
        stripeCardExpiryRef.current.destroy()
      }
      if (stripeCardCvcRef.current) {
        stripeCardCvcRef.current.destroy()
      }

      const baseStyle = {
        style: {
          base: {
            color: '#2e2e2e',
            fontFamily: '"Nunito Sans", sans-serif',
            fontSize: '18px',
            '::placeholder': {
              color: '#8f7e69'
            }
          },
          invalid: {
            color: '#933b27'
          }
        }
      }

      stripeCardNumberRef.current = stripeElementsRef.current.create('cardNumber', baseStyle)
      stripeCardExpiryRef.current = stripeElementsRef.current.create('cardExpiry', baseStyle)
      stripeCardCvcRef.current = stripeElementsRef.current.create('cardCvc', baseStyle)

      const numberElement = document.getElementById(STRIPE_CARD_NUMBER_CONTAINER_ID)
      const expiryElement = document.getElementById(STRIPE_CARD_EXPIRY_CONTAINER_ID)
      const cvcElement = document.getElementById(STRIPE_CARD_CVC_CONTAINER_ID)
      if (!numberElement || !expiryElement || !cvcElement) {
        throw new Error('No se encontro el contenedor de Stripe en el DOM')
      }

      stripeCardNumberRef.current.mount(`#${STRIPE_CARD_NUMBER_CONTAINER_ID}`)
      stripeCardExpiryRef.current.mount(`#${STRIPE_CARD_EXPIRY_CONTAINER_ID}`)
      stripeCardCvcRef.current.mount(`#${STRIPE_CARD_CVC_CONTAINER_ID}`)
      stripeCardNumberRef.current.on('ready', () => {
        setIsLoading(false)
      })
      stripeCardNumberRef.current.on('change', (event) => {
        if (event?.error?.message) {
          setErrorMessage(event.error.message)
          return
        }
        setErrorMessage('')
      })
    } catch (error) {
      setErrorMessage(error?.message || 'No se pudo iniciar Stripe')
      setIsLoading(false)
    }

    return () => {
      if (stripeCardNumberRef.current) {
        try {
          stripeCardNumberRef.current.destroy()
        } catch (error) {
          console.warn('No se pudo destruir Stripe cardNumber:', error?.message || error)
        }
        stripeCardNumberRef.current = null
      }
      if (stripeCardExpiryRef.current) {
        try {
          stripeCardExpiryRef.current.destroy()
        } catch (error) {
          console.warn('No se pudo destruir Stripe cardExpiry:', error?.message || error)
        }
        stripeCardExpiryRef.current = null
      }
      if (stripeCardCvcRef.current) {
        try {
          stripeCardCvcRef.current.destroy()
        } catch (error) {
          console.warn('No se pudo destruir Stripe cardCvc:', error?.message || error)
        }
        stripeCardCvcRef.current = null
      }
      stripeElementsRef.current = null
      stripeRef.current = null
    }
  }, [stripeSdkReady, stripePublishableKey, items, payableAmount])

  const handleStripePayment = async () => {
    try {
      if (isStripePaying) {
        return
      }
      if (!stripeRef.current || !stripeCardNumberRef.current || payableAmount <= 0) {
        setErrorMessage('Stripe no esta listo para procesar el pago')
        return
      }

      setIsStripePaying(true)
      setErrorMessage('')
      setPaymentMessage('')

      const createIntentResponse = await fetch(`${apiBaseUrl}/api/stripe/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: payableAmount,
          currency: 'mxn',
          items,
          customer: {
            fullName: deliveryDetails.fullName,
            phone: deliveryDetails.phone,
            email: customerEmail
          },
          delivery: {
            city: selectedDeliveryCity,
            date: selectedDeliveryDate,
            time: selectedDeliveryTime,
            streetAddress: deliveryDetails.streetAddress
          }
        })
      })
      const createIntentText = await createIntentResponse.text()
      let createIntentPayload = null
      try {
        createIntentPayload = JSON.parse(createIntentText)
      } catch {
        throw new Error(`Respuesta invalida del servidor Stripe (${createIntentResponse.status}). Verifica que el backend este reiniciado y responda /api/stripe/create-payment-intent`)
      }
      if (!createIntentResponse.ok) {
        throw new Error(createIntentPayload?.error || 'No se pudo inicializar el pago en Stripe')
      }

      const result = await stripeRef.current.confirmCardPayment(createIntentPayload.clientSecret, {
        payment_method: {
          card: stripeCardNumberRef.current,
          billing_details: {
            name: String(stripeCardholderName || deliveryDetails.fullName || '').trim() || undefined,
            email: String(customerEmail || '').trim() || undefined,
            phone: String(deliveryDetails.phone || '').trim() || undefined
          }
        }
      })

      if (result.error) {
        throw new Error(result.error.message || 'Stripe rechazo el pago')
      }

      const status = result.paymentIntent?.status
      if (status === 'succeeded') {
        setPaymentMessage('Pago aprobado. Tu pedido fue registrado correctamente.')
        onPaymentApproved?.()
        return
      }

      if (status === 'processing' || status === 'requires_capture') {
        setPaymentMessage('Pago en proceso. Te confirmaremos cuando se acredite.')
        return
      }

      throw new Error(`Estado de pago no esperado en Stripe: ${status || 'sin estado'}`)
    } catch (error) {
      setErrorMessage(error?.message || 'No se pudo procesar el pago con Stripe')
    } finally {
      setIsStripePaying(false)
    }
  }

  return (
    <>
      {!stripePublishableKey && (
        <p className="tarjeta__error">
          Falta configurar VITE_STRIPE_PUBLISHABLE_KEY para usar Stripe.
        </p>
      )}
      {stripePublishableKey && payableAmount > 0 && (
        <div className="tarjeta__stripe-wrap">
          <div className="tarjeta__stripe-brick">
            <div className="tarjeta__stripe-head">
              <h3 className="tarjeta__stripe-title">Tarjeta de credito o debito</h3>
              <ul className="tarjeta__stripe-brands" aria-label="Marcas de tarjeta en Stripe">
                <li className="tarjeta__stripe-brand">VISA</li>
                <li className="tarjeta__stripe-brand">MC</li>
                <li className="tarjeta__stripe-brand">AMEX</li>
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
                onChange={(event) => setStripeCardholderName(event.target.value)}
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
      )}
      {errorMessage && <p className="tarjeta__error">{errorMessage}</p>}
      {paymentMessage && <p className="tarjeta__success">{paymentMessage}</p>}
      {(isLoading || isStripePaying) && <span className="tarjeta__loading">Cargando formulario...</span>}
    </>
  )
}

export default StripePayment
