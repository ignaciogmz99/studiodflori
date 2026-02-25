import './navbar.css'
import { useState } from 'react'
import logo from './assets/logo_bien.jpg'
import { useCart } from './context/CartContext'

const panelContent = {
  regalos: {
    title: 'Regalos',
    heading: 'Sugerencias de regalo',
    text: 'Arreglos personalizados, cajas florales y detalles para fechas especiales. Muy pronto agregaremos el catalogo completo.'
  },
  contacto: {
    title: 'Contacto',
    heading: 'Habla con nosotros',
    text: 'Escribenos para pedidos, cotizaciones o dudas sobre disponibilidad. Horario de atencion: Lunes a Sabado de 9:00 a 18:00.'
  },
  direccion: {
    title: 'Direccion',
    heading: 'Ubicacion',
    text: 'Estamos preparando la direccion final del local para compartirla aqui con mapa y referencia exacta.'
  }
}

function Navbar() {
  const [activePanel, setActivePanel] = useState(null)
  const { items, totalItems, totalPrice, addToCart, decreaseQuantity, removeFromCart, clearCart } = useCart()

  const handleOpen = (panelKey) => {
    setActivePanel((current) => (current === panelKey ? null : panelKey))
  }

  const handleClose = () => {
    setActivePanel(null)
  }

  const selectedContent = activePanel ? panelContent[activePanel] : null

  return (
    <>
      <nav className="navbar" aria-label="Barra principal">
        <a className="navbar__brand" href="#" aria-label="Studio del Flori">
          <span className="navbar__brand-icon-wrap">
            <img className="navbar__logo-image" src={logo} alt="Logo de Studio del Flori" />
          </span>
          <span className="navbar__brand-text"> Studiod'flori</span>
        </a>

        <ul className="navbar__menu">
          <li>
            <a className="navbar__link" href="#">
              Tipo De Flor
            </a>
          </li>
          <li>
            <button
              type="button"
              className="navbar__link navbar__link-button"
              onClick={() => handleOpen('regalos')}
              aria-expanded={activePanel === 'regalos'}
            >
              Regalos
            </button>
          </li>
          <li>
            <button
              type="button"
              className="navbar__link navbar__link-button"
              onClick={() => handleOpen('contacto')}
              aria-expanded={activePanel === 'contacto'}
            >
              Contacto
            </button>
          </li>
          <li>
            <button
              type="button"
              className="navbar__link navbar__link-button"
              onClick={() => handleOpen('direccion')}
              aria-expanded={activePanel === 'direccion'}
            >
              Direccion
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`navbar__link navbar__link-button navbar__cart-button ${totalItems > 0 ? 'navbar__cart-button--alert' : ''}`}
              onClick={() => handleOpen('cart')}
              aria-expanded={activePanel === 'cart'}
              aria-label={`Carrito con ${totalItems} producto${totalItems === 1 ? '' : 's'}`}
            >
              Carrito
              {totalItems > 0 && (
                <span className="navbar__cart-badge" aria-hidden="true">
                  {totalItems > 99 ? '99+' : totalItems}
                </span>
              )}
            </button>
          </li>
        </ul>
      </nav>

      {activePanel === 'cart' && (
        <div className="navbar__panel-backdrop" onClick={handleClose}>
          <section
            className="navbar__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Carrito de compras"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="navbar__panel-close" onClick={handleClose} aria-label="Cerrar">
              x
            </button>
            <h2 className="navbar__panel-title">Carrito</h2>
            {items.length === 0 && (
              <p className="navbar__panel-text">Aun no agregas flores al carrito.</p>
            )}
            {items.length > 0 && (
              <>
                <ul className="navbar__cart-list">
                  {items.map((item) => (
                    <li className="navbar__cart-item" key={item.id}>
                      <img className="navbar__cart-item-image" src={item.image} alt={item.name} />
                      <div className="navbar__cart-item-main">
                        <p className="navbar__cart-item-name">{item.name}</p>
                        <p className="navbar__cart-item-price">${item.price} MXN</p>
                        <div className="navbar__cart-item-controls">
                          <button type="button" onClick={() => decreaseQuantity(item.id)}>-</button>
                          <span>{item.quantity}</span>
                          <button type="button" onClick={() => addToCart(item)}>+</button>
                          <button type="button" onClick={() => removeFromCart(item.id)}>Quitar</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="navbar__cart-total">Total: ${totalPrice.toFixed(2)} MXN</p>
                <button type="button" className="navbar__cart-clear" onClick={clearCart}>
                  Vaciar carrito
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {selectedContent && activePanel !== 'cart' && (
        <div className="navbar__panel-backdrop" onClick={handleClose}>
          <section
            className="navbar__panel"
            role="dialog"
            aria-modal="true"
            aria-label={selectedContent.title}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="navbar__panel-close" onClick={handleClose} aria-label="Cerrar">
              x
            </button>
            <h2 className="navbar__panel-title">{selectedContent.title}</h2>
            <h3 className="navbar__panel-heading">{selectedContent.heading}</h3>
            <p className="navbar__panel-text">{selectedContent.text}</p>
          </section>
        </div>
      )}
    </>
  )
}

export default Navbar
