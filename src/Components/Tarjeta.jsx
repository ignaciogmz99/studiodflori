import { useState } from 'react'
import './Tarjeta.css'
import { useCart } from '../context/CartContext'

function Tarjeta() {
  const {
    items,
    totalPrice,
    backToPaymentForm,
    deliveryDetails,
    selectedDeliveryCity,
    selectedDeliveryDate,
    selectedDeliveryTime
  } = useCart()
  const [customerEmail, setCustomerEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleStartMercadoPago = async () => {
    if (items.length === 0 || isLoading) {
      return
    }

    try {
      setIsLoading(true)
      setErrorMessage('')

      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'}/api/mercadopago/create-preference`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
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
        }
      )

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo crear la preferencia de pago')
      }

      const checkoutUrl = payload.initPoint || payload.sandboxInitPoint
      if (!checkoutUrl) {
        throw new Error('Mercado Pago no devolvio una URL de checkout')
      }

      const checkoutWindow = window.open(checkoutUrl, '_blank')
      if (!checkoutWindow) {
        throw new Error('Tu navegador bloqueo la nueva pestana. Permite popups e intenta de nuevo.')
      }
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo iniciar el pago con Mercado Pago')
      setIsLoading(false)
    }
  }

  return (
    <section className="tarjeta" aria-label="Pago con tarjeta">
      <header className="tarjeta__header">
        <h2 className="tarjeta__title">Pagar con Mercado Pago</h2>
      </header>

      <p className="tarjeta__secure-note">
        Pago seguro procesado con Mercado Pago.
      </p>
      <div className="tarjeta__brands" aria-label="Tarjetas aceptadas">
        <span className="tarjeta__brands-label">Tarjetas aceptadas:</span>
        <ul className="tarjeta__brands-list">
          <li className="tarjeta__brand">Visa</li>
          <li className="tarjeta__brand">Mastercard</li>
          <li className="tarjeta__brand">American Express</li>
        </ul>
      </div>
      <p className="tarjeta__meta">Total a pagar: ${totalPrice.toFixed(2)} MXN</p>

      <div className="tarjeta__summary">
        <p className="tarjeta__summary-text">
          Al continuar, te llevaremos al checkout oficial de Mercado Pago para que ingreses tu tarjeta de forma segura.
        </p>
        <label className="tarjeta__field">
          <span className="tarjeta__label">Correo para recibir comprobante (opcional)</span>
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
      {errorMessage && <p className="tarjeta__error">{errorMessage}</p>}

      <div className="tarjeta__actions">
        <button type="button" className="tarjeta__button tarjeta__button--secondary" onClick={backToPaymentForm}>
          Volver
        </button>
        <button
          type="button"
          className="tarjeta__button"
          disabled={isLoading || items.length === 0}
          onClick={handleStartMercadoPago}
        >
          {isLoading ? 'Conectando...' : 'Ir a Mercado Pago'}
        </button>
      </div>
    </section>
  )
}

export default Tarjeta
