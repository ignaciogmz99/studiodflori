import { useEffect, useRef, useState } from 'react'
import './Tarjeta.css'
import { useCart } from '../context/CartContext'

const MP_SDK_URL = 'https://sdk.mercadopago.com/js/v2'
const STRIPE_SDK_URL = 'https://js.stripe.com/v3/'
const BRICK_CONTAINER_ID = 'mp-card-payment-brick-container'
const STRIPE_CARD_NUMBER_CONTAINER_ID = 'stripe-card-number-element'
const STRIPE_CARD_EXPIRY_CONTAINER_ID = 'stripe-card-expiry-element'
const STRIPE_CARD_CVC_CONTAINER_ID = 'stripe-card-cvc-element'

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
  const [paymentProvider, setPaymentProvider] = useState('mercadopago')
  const [customerEmail, setCustomerEmail] = useState('')
  const [stripeCardholderName, setStripeCardholderName] = useState('')
  const [mpSdkReady, setMpSdkReady] = useState(Boolean(window.MercadoPago))
  const [stripeSdkReady, setStripeSdkReady] = useState(Boolean(window.Stripe))
  const [isLoading, setIsLoading] = useState(false)
  const [isStripePaying, setIsStripePaying] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [paymentMessage, setPaymentMessage] = useState('')
  const brickControllerRef = useRef(null)
  const stripeRef = useRef(null)
  const stripeElementsRef = useRef(null)
  const stripeCardNumberRef = useRef(null)
  const stripeCardExpiryRef = useRef(null)
  const stripeCardCvcRef = useRef(null)

  useEffect(() => {
    if (window.MercadoPago) {
      return
    }

    const script = document.createElement('script')
    script.src = MP_SDK_URL
    script.async = true
    script.onload = () => setMpSdkReady(true)
    script.onerror = () => {
      setErrorMessage('No se pudo cargar Mercado Pago. Recarga la pagina e intenta de nuevo.')
      setMpSdkReady(false)
    }
    document.body.appendChild(script)

    return () => {
      script.remove()
    }
  }, [])

  useEffect(() => {
    if (window.Stripe) {
      return
    }

    const script = document.createElement('script')
    script.src = STRIPE_SDK_URL
    script.async = true
    script.onload = () => setStripeSdkReady(true)
    script.onerror = () => {
      setErrorMessage('No se pudo cargar Stripe. Recarga la pagina e intenta de nuevo.')
      setStripeSdkReady(false)
    }
    document.body.appendChild(script)

    return () => {
      script.remove()
    }
  }, [])

  useEffect(() => {
    if (
      paymentProvider !== 'mercadopago'
      || !mpSdkReady
      || !mpPublicKey
      || items.length === 0
      || payableAmount < 5
    ) {
      return
    }

    let isMounted = true
    const initializeBrick = async () => {
      try {
        setIsLoading(true)
        const mp = new window.MercadoPago(mpPublicKey, { locale: 'es-MX' })
        const bricksBuilder = mp.bricks()

        if (brickControllerRef.current) {
          await brickControllerRef.current.unmount()
          brickControllerRef.current = null
        }

        const controller = await bricksBuilder.create(
          'cardPayment',
          BRICK_CONTAINER_ID,
          {
            initialization: {
              amount: payableAmount,
              payer: customerEmail
                ? { email: customerEmail.trim() }
                : {}
            },
            customization: {
              paymentMethods: {
                minInstallments: 1,
                maxInstallments: 1
              }
            },
            callbacks: {
              onReady: () => {
                if (isMounted) {
                  setIsLoading(false)
                }
              },
              onSubmit: async (cardFormData) => {
                setErrorMessage('')
                setPaymentMessage('')
                const response = await fetch(`${apiBaseUrl}/api/mercadopago/process-payment`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    ...cardFormData,
                    transaction_amount: payableAmount,
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
                      streetAddress: deliveryDetails.streetAddress,
                      neighborhood: deliveryDetails.neighborhood,
                      postalCode: deliveryDetails.postalCode,
                      specialInstructions: deliveryDetails.specialInstructions
                    }
                  })
                })

                const payload = await response.json()
                if (!response.ok) {
                  throw new Error(payload?.error || 'No se pudo procesar el pago')
                }

                if (payload.status === 'approved') {
                  setPaymentMessage('Pago aprobado. Tu pedido fue registrado correctamente.')
                  clearCart()
                  return
                }

                if (payload.status === 'in_process' || payload.status === 'pending') {
                  setPaymentMessage('Pago en proceso. Te confirmaremos cuando se acredite.')
                  return
                }

                throw new Error(`Pago rechazado: ${payload.status_detail || payload.status || 'sin detalle'}`)
              },
              onError: (error) => {
                const errorCode = error?.cause?.[0]?.code ? ` (${error.cause[0].code})` : ''
                console.error('Error Mercado Pago Brick:', error)
                setErrorMessage((error?.message || 'Ocurrio un error al cargar el formulario de pago') + errorCode)
                setIsLoading(false)
              }
            }
          }
        )

        if (isMounted) {
          brickControllerRef.current = controller
        } else {
          await controller.unmount()
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error?.message || 'No se pudo iniciar el formulario de pago')
          setIsLoading(false)
        }
      }
    }

    initializeBrick()
    return () => {
      isMounted = false
    }
  }, [
    paymentProvider,
    mpSdkReady,
    mpPublicKey,
    apiBaseUrl,
    items,
    payableAmount,
    customerEmail,
    clearCart,
    deliveryDetails,
    selectedDeliveryCity,
    selectedDeliveryDate,
    selectedDeliveryTime
  ])

  useEffect(() => {
    if (
      paymentProvider !== 'stripe'
      || !stripeSdkReady
      || !stripePublishableKey
      || items.length === 0
      || payableAmount <= 0
    ) {
      return
    }

    try {
      setIsLoading(true)
      stripeRef.current = window.Stripe(stripePublishableKey, { locale: 'es' })
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
        stripeCardNumberRef.current.destroy()
        stripeCardNumberRef.current = null
      }
      if (stripeCardExpiryRef.current) {
        stripeCardExpiryRef.current.destroy()
        stripeCardExpiryRef.current = null
      }
      if (stripeCardCvcRef.current) {
        stripeCardCvcRef.current.destroy()
        stripeCardCvcRef.current = null
      }
    }
  }, [
    paymentProvider,
    stripeSdkReady,
    stripePublishableKey,
    items,
    payableAmount
  ])

  useEffect(() => {
    return () => {
      if (brickControllerRef.current) {
        brickControllerRef.current.unmount().catch(() => {})
      }
      if (stripeCardNumberRef.current) {
        stripeCardNumberRef.current.destroy()
      }
      if (stripeCardExpiryRef.current) {
        stripeCardExpiryRef.current.destroy()
      }
      if (stripeCardCvcRef.current) {
        stripeCardCvcRef.current.destroy()
      }
    }
  }, [])

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
        clearCart()
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

  const handleChangeProvider = (provider) => {
    setErrorMessage('')
    setPaymentMessage('')
    setPaymentProvider(provider)
  }

  return (
    <section className="tarjeta" aria-label="Pago con tarjeta">
      <header className="tarjeta__header">
        <h2 className="tarjeta__title">Pagar con tarjeta</h2>
      </header>

      <p className="tarjeta__secure-note">
        Elige tu proveedor de pago: Mercado Pago o Stripe.
      </p>
      <div className="tarjeta__provider-switch" role="radiogroup" aria-label="Proveedor de pago">
        <button
          type="button"
          className={`tarjeta__provider-option ${paymentProvider === 'mercadopago' ? 'tarjeta__provider-option--active' : ''}`}
          onClick={() => handleChangeProvider('mercadopago')}
          aria-pressed={paymentProvider === 'mercadopago'}
        >
          Mercado Pago
        </button>
        <button
          type="button"
          className={`tarjeta__provider-option ${paymentProvider === 'stripe' ? 'tarjeta__provider-option--active' : ''}`}
          onClick={() => handleChangeProvider('stripe')}
          aria-pressed={paymentProvider === 'stripe'}
        >
          Stripe
        </button>
      </div>
      <div className="tarjeta__brands" aria-label="Tarjetas aceptadas">
        <span className="tarjeta__brands-label">Tarjetas aceptadas:</span>
        <ul className="tarjeta__brands-list">
          <li className="tarjeta__brand">Visa</li>
          <li className="tarjeta__brand">Mastercard</li>
          <li className="tarjeta__brand">American Express</li>
        </ul>
      </div>
      <p className="tarjeta__meta">Total a pagar: ${payableAmount.toFixed(2)} MXN</p>

      <div className="tarjeta__summary">
        <p className="tarjeta__summary-text">
          {paymentProvider === 'mercadopago'
            ? 'Completa tu pago con Mercado Pago sin salir de esta pagina.'
            : 'Completa tu pago con Stripe con tarjeta bancaria.'}
        </p>
        <label className="tarjeta__field">
          <span className="tarjeta__label">Correo para el comprobante (opcional)</span>
          <input
            className="tarjeta__input"
            type="email"
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
            placeholder="correo@ejemplo.com"
            autoComplete="email"
          />
        </label>
      </div>
      {paymentProvider === 'mercadopago' && !mpPublicKey && (
        <p className="tarjeta__error">
          Falta configurar VITE_MERCADO_PAGO_PUBLIC_KEY para mostrar Mercado Pago Bricks.
        </p>
      )}
      {paymentProvider === 'mercadopago' && mpPublicKey && payableAmount < 5 && (
        <p className="tarjeta__error">
          El monto minimo para procesar con tarjeta en pruebas es 5 MXN. Agrega mas productos al carrito.
        </p>
      )}
      {paymentProvider === 'mercadopago' && mpPublicKey && payableAmount >= 5 && (
        <div id={BRICK_CONTAINER_ID} className="tarjeta__brick" />
      )}

      {paymentProvider === 'stripe' && !stripePublishableKey && (
        <p className="tarjeta__error">
          Falta configurar VITE_STRIPE_PUBLISHABLE_KEY para usar Stripe.
        </p>
      )}
      {paymentProvider === 'stripe' && stripePublishableKey && payableAmount > 0 && (
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

      <div className="tarjeta__actions">
        <button type="button" className="tarjeta__button tarjeta__button--secondary" onClick={backToPaymentForm}>
          Volver
        </button>
        {(isLoading || isStripePaying) && <span className="tarjeta__loading">Cargando formulario...</span>}
      </div>
    </section>
  )
}

export default Tarjeta
