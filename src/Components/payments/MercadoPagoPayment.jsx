import { useEffect, useRef, useState } from 'react'

const MP_SDK_URL = 'https://sdk.mercadopago.com/js/v2'
const BRICK_CONTAINER_ID = 'mp-card-payment-brick-container'

let mercadoPagoScriptPromise = null

function ensureMercadoPagoSdk() {
  if (window.MercadoPago) {
    return Promise.resolve()
  }

  if (mercadoPagoScriptPromise) {
    return mercadoPagoScriptPromise
  }

  mercadoPagoScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${MP_SDK_URL}"]`)
    if (existingScript) {
      if (window.MercadoPago) {
        resolve()
        return
      }
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar Mercado Pago SDK')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = MP_SDK_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar Mercado Pago SDK'))
    document.body.appendChild(script)
  })

  return mercadoPagoScriptPromise
}

async function safeUnmountBrick(controller) {
  if (!controller || typeof controller.unmount !== 'function') {
    return
  }

  try {
    const result = controller.unmount()
    if (result && typeof result.then === 'function') {
      await result
    }
  } catch (error) {
    console.warn('No se pudo desmontar Mercado Pago Brick:', error?.message || error)
  }
}

function MercadoPagoPayment({
  apiBaseUrl,
  mpPublicKey,
  payableAmount,
  items,
  customerEmail,
  deliveryDetails,
  selectedDeliveryCity,
  selectedDeliveryDate,
  selectedDeliveryTime,
  onPaymentApproved
}) {
  const [mpSdkReady, setMpSdkReady] = useState(Boolean(window.MercadoPago))
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [paymentMessage, setPaymentMessage] = useState('')
  const brickControllerRef = useRef(null)
  const payloadRef = useRef({
    items,
    customerEmail,
    deliveryDetails,
    selectedDeliveryCity,
    selectedDeliveryDate,
    selectedDeliveryTime
  })

  useEffect(() => {
    payloadRef.current = {
      items,
      customerEmail,
      deliveryDetails,
      selectedDeliveryCity,
      selectedDeliveryDate,
      selectedDeliveryTime
    }
  }, [
    items,
    customerEmail,
    deliveryDetails,
    selectedDeliveryCity,
    selectedDeliveryDate,
    selectedDeliveryTime
  ])

  useEffect(() => {
    let isMounted = true

    setIsLoading(true)
    ensureMercadoPagoSdk()
      .then(() => {
        if (!isMounted) {
          return
        }
        setMpSdkReady(true)
        setErrorMessage('')
      })
      .catch(() => {
        if (!isMounted) {
          return
        }
        setMpSdkReady(false)
        setErrorMessage('No se pudo cargar Mercado Pago. Recarga la pagina e intenta de nuevo.')
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
    if (!mpSdkReady || !mpPublicKey || items.length === 0 || payableAmount < 5) {
      return
    }

    let isMounted = true
    const initializeBrick = async () => {
      try {
        setIsLoading(true)
        if (typeof window.MercadoPago !== 'function') {
          throw new Error('Mercado Pago SDK no esta disponible en la ventana global')
        }
        const mp = new window.MercadoPago(mpPublicKey, { locale: 'es-MX' })
        const bricksBuilder = mp.bricks()

        if (brickControllerRef.current) {
          await safeUnmountBrick(brickControllerRef.current)
          brickControllerRef.current = null
        }

        const controller = await bricksBuilder.create('cardPayment', BRICK_CONTAINER_ID, {
          initialization: {
            amount: payableAmount
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
              const currentPayload = payloadRef.current
              const response = await fetch(`${apiBaseUrl}/api/mercadopago/process-payment`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  ...cardFormData,
                  transaction_amount: payableAmount,
                  items: currentPayload.items,
                  customer: {
                    fullName: currentPayload.deliveryDetails.fullName,
                    phone: currentPayload.deliveryDetails.phone,
                    email: currentPayload.customerEmail
                  },
                  delivery: {
                    city: currentPayload.selectedDeliveryCity,
                    date: currentPayload.selectedDeliveryDate,
                    time: currentPayload.selectedDeliveryTime,
                    streetAddress: currentPayload.deliveryDetails.streetAddress,
                    neighborhood: currentPayload.deliveryDetails.neighborhood,
                    postalCode: currentPayload.deliveryDetails.postalCode,
                    specialInstructions: currentPayload.deliveryDetails.specialInstructions
                  }
                })
              })

              const payload = await response.json()
              if (!response.ok) {
                throw new Error(payload?.error || 'No se pudo procesar el pago')
              }

              if (payload.status === 'approved') {
                setPaymentMessage('Pago aprobado. Tu pedido fue registrado correctamente.')
                onPaymentApproved?.()
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
        })

        if (isMounted) {
          brickControllerRef.current = controller
        } else {
          await safeUnmountBrick(controller)
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
      if (brickControllerRef.current) {
        safeUnmountBrick(brickControllerRef.current)
        brickControllerRef.current = null
      }
    }
  }, [
    mpSdkReady,
    mpPublicKey,
    apiBaseUrl,
    items,
    payableAmount,
    onPaymentApproved
  ])

  return (
    <>
      {!mpPublicKey && (
        <p className="tarjeta__error">
          Falta configurar VITE_MERCADO_PAGO_PUBLIC_KEY para mostrar Mercado Pago Bricks.
        </p>
      )}
      {mpPublicKey && payableAmount < 5 && (
        <p className="tarjeta__error">
          El monto minimo para procesar con tarjeta en pruebas es 5 MXN. Agrega mas productos al carrito.
        </p>
      )}
      {mpPublicKey && payableAmount >= 5 && (
        <div id={BRICK_CONTAINER_ID} className="tarjeta__brick" />
      )}
      {errorMessage && <p className="tarjeta__error">{errorMessage}</p>}
      {paymentMessage && <p className="tarjeta__success">{paymentMessage}</p>}
      {isLoading && <span className="tarjeta__loading">Cargando formulario...</span>}
    </>
  )
}

export default MercadoPagoPayment
