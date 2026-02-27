import { useMemo } from 'react'
import './Pago.css'
import { useCart } from '../context/CartContext'
import { DELIVERY_CITIES } from '../constants/deliveryCities'

const MIN_LEAD_HOURS = 3

function resolveEarliestDate(preparationHours) {
  const safeHours = Number.isFinite(preparationHours) && preparationHours > 0
    ? Math.max(preparationHours, MIN_LEAD_HOURS)
    : MIN_LEAD_HOURS
  const now = new Date()
  const earliest = new Date(now.getTime() + (safeHours * 60 * 60 * 1000))
  earliest.setHours(0, 0, 0, 0)
  return earliest
}

function formatDeliveryDate(dateValue) {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(dateValue)
}

function Pago() {
  const {
    items,
    totalPrice,
    closePaymentView,
    estimatedPreparationHours,
    selectedDeliveryDate,
    selectedDeliveryTime,
    selectedDeliveryCity,
    setSelectedDeliveryCity,
    deliveryDetails,
    setDeliveryDetails,
    openCardView
  } = useCart()
  const minDeliveryDate = resolveEarliestDate(estimatedPreparationHours)
  const deliveryDate = selectedDeliveryDate
    ? new Date(`${selectedDeliveryDate}T00:00:00`)
    : minDeliveryDate
  const cityIsSupported = useMemo(
    () => DELIVERY_CITIES.includes(selectedDeliveryCity),
    [selectedDeliveryCity]
  )

  const handleDeliveryContactChange = (event) => {
    const { name, value } = event.target
    setDeliveryDetails((current) => ({
      ...current,
      [name]: value
    }))
  }
  const isDeliveryFormValid = Boolean(
    deliveryDetails.fullName.trim()
    && deliveryDetails.phone.trim()
    && deliveryDetails.streetAddress.trim()
    && deliveryDetails.neighborhood.trim()
    && deliveryDetails.postalCode.trim()
    && cityIsSupported
  )

  return (
    <section className="pago" aria-label="Resumen de pago">
      <header className="pago__header">
        <h2 className="pago__title">Pago</h2>
        <button type="button" className="pago__back" onClick={closePaymentView}>
          Volver al catalogo
        </button>
      </header>

      <p className="pago__meta">
        Fecha de entrega: {formatDeliveryDate(deliveryDate)}
        {selectedDeliveryDate ? '' : ' (minima)'}
      </p>
      <p className="pago__meta">
        Horario: {selectedDeliveryTime || 'Sin horario seleccionado'}
      </p>
      <div className="pago__checkout-grid">
        <section className="pago__delivery" aria-label="Informacion de entrega">
          <h3 className="pago__delivery-title">Informacion para entregar tu pedido</h3>
          <div className="pago__delivery-grid">
            <label className="pago__field">
              <span className="pago__field-label">Nombre completo</span>
              <input
                className="pago__field-input"
                type="text"
                name="fullName"
                value={deliveryDetails.fullName}
                onChange={handleDeliveryContactChange}
                placeholder="Nombre y apellido"
                autoComplete="name"
              />
            </label>
            <label className="pago__field">
              <span className="pago__field-label">Telefono</span>
              <input
                className="pago__field-input"
                type="tel"
                name="phone"
                value={deliveryDetails.phone}
                onChange={handleDeliveryContactChange}
                placeholder="33 1234 5678"
                autoComplete="tel"
              />
            </label>
            <label className="pago__field pago__field--wide">
              <span className="pago__field-label">Calle y numero</span>
              <input
                className="pago__field-input"
                type="text"
                name="streetAddress"
                value={deliveryDetails.streetAddress}
                onChange={handleDeliveryContactChange}
                placeholder="Ej. Av. Mexico 1234"
                autoComplete="street-address"
              />
            </label>
            <label className="pago__field">
              <span className="pago__field-label">Colonia</span>
              <input
                className="pago__field-input"
                type="text"
                name="neighborhood"
                value={deliveryDetails.neighborhood}
                onChange={handleDeliveryContactChange}
                placeholder="Ej. Americana"
              />
            </label>
            <label className="pago__field">
              <span className="pago__field-label">Codigo postal</span>
              <input
                className="pago__field-input"
                type="text"
                name="postalCode"
                value={deliveryDetails.postalCode}
                onChange={handleDeliveryContactChange}
                placeholder="Ej. 44100"
                autoComplete="postal-code"
                inputMode="numeric"
              />
            </label>
            <label className="pago__field">
              <span className="pago__field-label">Ciudad</span>
              <select
                className="pago__field-input"
                value={selectedDeliveryCity}
                onChange={(event) => setSelectedDeliveryCity(event.target.value)}
                aria-label="Seleccionar ciudad de entrega"
              >
                {DELIVERY_CITIES.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </label>
            <label className="pago__field pago__field--wide">
              <span className="pago__field-label">Instrucciones especiales</span>
              <textarea
                className="pago__field-input pago__field-textarea"
                name="specialInstructions"
                value={deliveryDetails.specialInstructions}
                onChange={handleDeliveryContactChange}
                placeholder="Ej. Departamento 4B, tocar interfon 12, entregar en recepcion."
                rows={3}
              />
            </label>
          </div>
          {!cityIsSupported && (
            <p className="pago__warning">
              Solo realizamos entregas en Guadalajara, Zapopan, Tlaquepaque y Tonala.
            </p>
          )}
          <div className="pago__actions">
            <button
              type="button"
              className="pago__next"
              onClick={openCardView}
              disabled={!isDeliveryFormValid || items.length === 0}
            >
              Siguiente
            </button>
          </div>
        </section>

        <section className="pago__items" aria-label="Resumen del carrito">
          {items.length === 0 && (
            <p className="pago__empty">Tu carrito esta vacio.</p>
          )}

          {items.length > 0 && (
            <>
              <ul className="pago__list">
                {items.map((item) => (
                  <li className="pago__item" key={item.id}>
                    <img className="pago__image" src={item.image} alt={item.name} />
                    <div className="pago__item-main">
                      <p className="pago__name">{item.name}</p>
                      <p className="pago__meta">Cantidad: {item.quantity}</p>
                      <p className="pago__meta">Precio: ${item.price} MXN</p>
                    </div>
                    <p className="pago__subtotal">${(item.price * item.quantity).toFixed(2)} MXN</p>
                  </li>
                ))}
              </ul>

              <p className="pago__total">Total: ${totalPrice.toFixed(2)} MXN</p>
            </>
          )}
        </section>
      </div>
    </section>
  )
}

export default Pago
