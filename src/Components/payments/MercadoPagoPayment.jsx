import { useEffect, useRef, useState } from 'react'

const MP_SDK_URL = 'https://sdk.mercadopago.com/js/v2'
const BRICK_CONTAINER_ID = 'mp-card-payment-brick-container'
const PAYMENT_REQUEST_TIMEOUT_MS = 30000

let mercadoPagoScriptPromise = null

function withTimeout(promiseFactory, timeoutMs = PAYMENT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  return promiseFactory(controller.signal)
    .finally(() => {
      window.clearTimeout(timeoutId)
    })
}

function getMercadoPagoStatusMessage(payload = {}) {
  const status = String(payload?.status || '').trim().toLowerCase()
  const statusDetail = String(payload?.status_detail || '').trim()

  if (status === 'approved') {
    return {
      type: 'success',
      message: 'Pago aprobado. Tu pedido fue registrado correctamente.'
    }
  }

  if (status === 'in_process' || status === 'pending') {
    return {
      type: 'info',
      message: 'Tu pago esta en revision o en proceso. Te avisaremos cuando Mercado Pago lo acredite.'
    }
  }

  if (status === 'rejected' || status === 'cancelled') {
    return {
      type: 'error',
      message: `Tu pago no fue aprobado. ${statusDetail || 'Intenta con otra tarjeta o verifica los datos.'}`
    }
  }

  return {
    type: 'error',
    message: `No se pudo completar el pago. ${statusDetail || status || 'Intenta de nuevo.'}`
  }
}

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
  orderId,
  apiBaseUrl,
  mpPublicKey,
  payableAmount,
  items,
  hasApprovedPayment,
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
    deliveryDetails,
    selectedDeliveryCity,
    selectedDeliveryDate,
    selectedDeliveryTime
  })

  useEffect(() => {
    payloadRef.current = {
      items,
      deliveryDetails,
      selectedDeliveryCity,
      selectedDeliveryDate,
      selectedDeliveryTime
    }
  }, [
    items,
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
              try {
                setErrorMessage('')
                setPaymentMessage('')
                const currentPayload = payloadRef.current
                const isStorePickup = currentPayload.deliveryDetails.fulfillmentType === 'pickup'
                const response = await withTimeout((signal) => fetch(`${apiBaseUrl}/api/mercadopago/process-payment`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  signal,
                  body: JSON.stringify({
                    orderId,
                    ...cardFormData,
                    items: currentPayload.items,
                    customer: {
                      fullName: currentPayload.deliveryDetails.fullName,
                      phone: currentPayload.deliveryDetails.phone,
                      email: ''
                    },
                    delivery: {
                      fulfillmentType: currentPayload.deliveryDetails.fulfillmentType || 'delivery',
                      city: isStorePickup ? null : currentPayload.selectedDeliveryCity,
                      date: currentPayload.selectedDeliveryDate,
                      time: currentPayload.selectedDeliveryTime,
                      recipientType: currentPayload.deliveryDetails.recipientType || 'self',
                      recipientName: currentPayload.deliveryDetails.recipientType === 'other'
                        ? currentPayload.deliveryDetails.recipientName
                        : null,
                      streetAddress: isStorePickup ? null : currentPayload.deliveryDetails.streetAddress,
                      neighborhood: isStorePickup ? null : currentPayload.deliveryDetails.neighborhood,
                      postalCode: isStorePickup ? null : currentPayload.deliveryDetails.postalCode,
                      flowerMessage: currentPayload.deliveryDetails.flowerMessage,
                      specialInstructions: currentPayload.deliveryDetails.specialInstructions
                    }
                  })
                }))

                const payload = await response.json()
                if (!response.ok) {
                  throw new Error(payload?.error || 'No se pudo procesar el pago')
                }

                const statusResolution = getMercadoPagoStatusMessage(payload)
                if (statusResolution.type === 'success') {
                  setPaymentMessage(statusResolution.message)
                  onPaymentApproved?.({
                    provider: 'mercadopago',
                    paymentId: payload?.id || '',
                    approvedAt: new Date().toISOString(),
                    amount: payableAmount,
                    currency: 'MXN'
                  })
                  return
                }

                if (statusResolution.type === 'info') {
                  setPaymentMessage(statusResolution.message)
                  return
                }

                throw new Error(statusResolution.message)
              } catch (error) {
                const isAbort = error?.name === 'AbortError'
                setErrorMessage(
                  isAbort
                    ? 'Mercado Pago tardo demasiado en responder. Revisa si el cargo se genero antes de intentar nuevamente.'
                    : (error?.message || 'No se pudo procesar el pago con Mercado Pago')
                )
                throw error
              }
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
          const isAbort = error?.name === 'AbortError'
          setErrorMessage(
            isAbort
              ? 'Mercado Pago tardo demasiado en responder. Revisa si el cargo se genero antes de intentar nuevamente.'
              : (error?.message || 'No se pudo iniciar el formulario de pago')
          )
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
    orderId,
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
      {mpPublicKey && payableAmount < 5 && !hasApprovedPayment && (
        <p className="tarjeta__error">
          El monto minimo para procesar con tarjeta es 5 MXN. Agrega mas productos al carrito.
        </p>
      )}
      {mpPublicKey && payableAmount >= 5 && !hasApprovedPayment && (
        <div id={BRICK_CONTAINER_ID} className="tarjeta__brick" />
      )}
      {errorMessage && <p className="tarjeta__error">{errorMessage}</p>}
      {paymentMessage && <p className="tarjeta__success">{paymentMessage}</p>}
      {isLoading && <span className="tarjeta__loading">Cargando formulario...</span>}
    </>
  )
}

export default MercadoPagoPayment
