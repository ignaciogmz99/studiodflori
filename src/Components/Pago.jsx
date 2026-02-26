import './Pago.css'
import { useCart } from '../context/CartContext'

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
    selectedDeliveryTime
  } = useCart()
  const minDeliveryDate = resolveEarliestDate(estimatedPreparationHours)
  const deliveryDate = selectedDeliveryDate
    ? new Date(`${selectedDeliveryDate}T00:00:00`)
    : minDeliveryDate

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
  )
}

export default Pago
