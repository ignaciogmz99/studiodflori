import './Pago.css'
import { useCart } from '../context/CartContext'

function Pago() {
  const { items, totalPrice, closePaymentView } = useCart()

  return (
    <section className="pago" aria-label="Resumen de pago">
      <header className="pago__header">
        <h2 className="pago__title">Pago</h2>
        <button type="button" className="pago__back" onClick={closePaymentView}>
          Volver al catalogo
        </button>
      </header>

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
