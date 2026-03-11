import { useMemo } from 'react'
import './Pago.css'
import { useCart } from '../context/CartContext'
import { DELIVERY_CITIES } from '../constants/deliveryCities'

const MIN_LEAD_HOURS = 3
const PHONE_COUNTRY_CODES = [
  { value: '+52', label: '+52 MEX' },
  { value: '+1', label: '+1 EUA/CAN' },
  { value: '+34', label: '+34 ESP' },
  { value: '+54', label: '+54 ARG' },
  { value: '+56', label: '+56 CHL' },
  { value: '+57', label: '+57 COL' },
  { value: '+51', label: '+51 PER' }
]
const FULFILLMENT_OPTIONS = [
  { value: 'delivery', label: 'Entrega a domicilio' },
  { value: 'pickup', label: 'Recoger en tienda' }
]
const RECIPIENT_OPTIONS = [
  { value: 'self', label: 'Lo recibo yo' },
  { value: 'other', label: 'Lo recibe otra persona' }
]

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

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
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
  const phoneCountryCode = deliveryDetails.phoneCountryCode || '+52'
  const fulfillmentType = deliveryDetails.fulfillmentType || 'delivery'
  const recipientType = deliveryDetails.recipientType || 'self'
  const isStorePickup = fulfillmentType === 'pickup'
  const isRecipientOther = recipientType === 'other'
  const phoneDigits = useMemo(
    () => onlyDigits(deliveryDetails.phone),
    [deliveryDetails.phone]
  )
  const isPhoneCountryCodeValid = PHONE_COUNTRY_CODES.some((code) => code.value === phoneCountryCode)
  const isPhoneValid = isPhoneCountryCodeValid && phoneDigits.length === 10

  const handleDeliveryContactChange = (event) => {
    const { name, value } = event.target

    if (name === 'phone') {
      setDeliveryDetails((current) => ({
        ...current,
        phone: onlyDigits(value).slice(0, 10)
      }))
      return
    }
    if (name === 'flowerMessage') {
      setDeliveryDetails((current) => ({
        ...current,
        flowerMessage: String(value || '').slice(0, 250)
      }))
      return
    }
    if (name === 'recipientType') {
      setDeliveryDetails((current) => ({
        ...current,
        recipientType: value,
        recipientName: value === 'self' ? '' : current.recipientName
      }))
      return
    }

    setDeliveryDetails((current) => ({
      ...current,
      [name]: value
    }))
  }

  const isDeliveryFormValid = Boolean(
    deliveryDetails.fullName.trim()
    && isPhoneValid
    && (!isRecipientOther || deliveryDetails.recipientName.trim())
    && (
      isStorePickup
      || (
        deliveryDetails.streetAddress.trim()
        && deliveryDetails.neighborhood.trim()
        && deliveryDetails.postalCode.trim()
        && cityIsSupported
      )
    )
  )

  return (
    <section className="pago" aria-label="Resumen de pago">
      <header className="pago__header">
        <h2 className="pago__title">Pago</h2>
        <button type="button" className="pago__back" onClick={closePaymentView}>
          Volver al catálogo
        </button>
      </header>

      <p className="pago__meta">
        Fecha de entrega: {formatDeliveryDate(deliveryDate)}
        {selectedDeliveryDate ? '' : ' (mínima)'}
      </p>
      <p className="pago__meta">
        Horario deseado: {selectedDeliveryTime || 'Sin horario seleccionado'}
      </p>
      <div className="pago__checkout-grid">
        <section className="pago__delivery" aria-label="Información de entrega">
          <h3 className="pago__delivery-title">Información para entregar tu pedido</h3>
          <div className="pago__delivery-grid">
            <label className="pago__field">
              <span className="pago__field-label">Tipo de entrega</span>
              <select
                className="pago__field-input"
                name="fulfillmentType"
                value={fulfillmentType}
                onChange={handleDeliveryContactChange}
                aria-label="Seleccionar tipo de entrega"
              >
                {FULFILLMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
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
            <label className="pago__field pago__field--wide">
              <span className="pago__field-label">¿Quién recibe el pedido?</span>
              <p className="pago__field-note">Puedes recibirlo tú o enviarlo a quien desees.</p>
              <select
                className="pago__field-input"
                name="recipientType"
                value={recipientType}
                onChange={handleDeliveryContactChange}
                aria-label="Seleccionar quién recibe el pedido"
              >
                {RECIPIENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {isRecipientOther && (
              <label className="pago__field pago__field--wide">
                <span className="pago__field-label">Nombre de quien recibe</span>
                <input
                  className="pago__field-input"
                  type="text"
                  name="recipientName"
                  value={deliveryDetails.recipientName || ''}
                  onChange={handleDeliveryContactChange}
                  placeholder="Nombre de la persona que recibe"
                  autoComplete="off"
                />
              </label>
            )}
            <label className="pago__field pago__field--wide">
              <span className="pago__field-label">Teléfono</span>
              <div className="pago__phone-row">
                <select
                  className="pago__field-input"
                  name="phoneCountryCode"
                  value={phoneCountryCode}
                  onChange={handleDeliveryContactChange}
                  aria-label="Prefijo telefónico"
                >
                  {PHONE_COUNTRY_CODES.map((code) => (
                    <option key={code.value} value={code.value}>{code.label}</option>
                  ))}
                </select>
                <input
                  className="pago__field-input"
                  type="tel"
                  name="phone"
                  value={deliveryDetails.phone}
                  onChange={handleDeliveryContactChange}
                  placeholder="3312345678"
                  autoComplete="tel-national"
                  inputMode="numeric"
                />
              </div>
            </label>
            {!isStorePickup && (
              <>
                <label className="pago__field pago__field--wide">
                  <span className="pago__field-label">Calle y número de entrega</span>
                  <input
                    className="pago__field-input"
                    type="text"
                    name="streetAddress"
                    value={deliveryDetails.streetAddress}
                    onChange={handleDeliveryContactChange}
                    placeholder="Ej. Av. México 1234"
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
                  <span className="pago__field-label">Código postal</span>
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
              </>
            )}
            <label className="pago__field pago__field--wide">
              <span className="pago__field-label">Mensaje para la flor (opcional)</span>
              <textarea
                className="pago__field-input pago__field-textarea"
                name="flowerMessage"
                value={deliveryDetails.flowerMessage || ''}
                onChange={handleDeliveryContactChange}
                placeholder="Ej. Feliz aniversario, te amo."
                maxLength={250}
                rows={2}
              />
            </label>
            <label className="pago__field pago__field--wide">
              <span className="pago__field-label">Instrucciones especiales</span>
              <textarea
                className="pago__field-input pago__field-textarea"
                name="specialInstructions"
                value={deliveryDetails.specialInstructions}
                onChange={handleDeliveryContactChange}
                placeholder="Ej. Departamento 4B, tocar interfon 12, entregar en recepción."
                rows={3}
              />
            </label>
          </div>
          {!isPhoneValid && (
            <p className="pago__warning">Ingresa un teléfono válido de 10 dígitos con el prefijo seleccionado.</p>
          )}
          {isRecipientOther && !deliveryDetails.recipientName.trim() && (
            <p className="pago__warning">Ingresa el nombre de quien recibe para continuar.</p>
          )}
          {!isStorePickup && !cityIsSupported && (
            <p className="pago__warning">
              Solo realizamos entregas en Guadalajara, Zapopan, Tlaquepaque y Tonalá.
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
            <p className="pago__empty">Tu carrito está vacío.</p>
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
