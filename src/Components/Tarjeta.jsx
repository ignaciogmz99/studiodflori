import { useMemo, useState } from 'react'
import './Tarjeta.css'
import { useCart } from '../context/CartContext'
import { defaultPaymentProvider, getPaymentProvider, paymentProviders } from './payments'
import PaymentProviderBoundary from './payments/PaymentProviderBoundary'

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
  const [customerEmail, setCustomerEmail] = useState('')

  const selectedProvider = useMemo(
    () => getPaymentProvider(paymentProvider),
    [paymentProvider]
  )

  const SelectedPaymentComponent = selectedProvider.Component

  const paymentSharedProps = {
    apiBaseUrl,
    mpPublicKey,
    stripePublishableKey,
    payableAmount,
    items,
    customerEmail,
    deliveryDetails,
    selectedDeliveryCity,
    selectedDeliveryDate,
    selectedDeliveryTime,
    onPaymentApproved: clearCart
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
        <p className="tarjeta__summary-text">{selectedProvider.summary}</p>
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

      <PaymentProviderBoundary providerKey={paymentProvider}>
        <SelectedPaymentComponent key={paymentProvider} {...paymentSharedProps} />
      </PaymentProviderBoundary>

      <div className="tarjeta__actions">
        <button type="button" className="tarjeta__button tarjeta__button--secondary" onClick={backToPaymentForm}>
          Volver
        </button>
      </div>
    </section>
  )
}

export default Tarjeta
