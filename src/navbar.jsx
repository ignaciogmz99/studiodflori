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
    text: 'Avenida Paseo de la Arboleda 2500, Guadalajara, Mexico, 44530',
    mapLabel: 'Ver en Google Maps',
    mapUrl: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.bing.com%2Fmaps%2Fdefault.aspx%3Fv%3D2%26pc%3DFACEBK%26mid%3D8100%26where1%3DAvenida%2520Paseo%2520de%2520la%2520Arboleda%25202500%252C%2520Guadalajara%252C%2520Mexico%252C%252044530%26FORM%3DFBKPL1%26mkt%3Des-MX%26fbclid%3DIwZXh0bgNhZW0CMTAAYnJpZBExUXY0bmZ2bE50U3hvYldVOXNydGMGYXBwX2lkEDIyMjAzOTE3ODgyMDA4OTIAAR5syCoDjfoavI3v-h0tViv4RzReD36doNPlYde5HIyhVzsZvdI1XJoDRrutrg_aem_JVaSkhFyQ5mjZrVxigAT_Q&h=AT6uZhjNnNoI6bHwkMnERxi0cXGjaXbR__AZ8-ixekjHbzV_PAplPlDc8wCblRJxYYAG9XOZBhQWj46sgKROyozcMlZkSYqIvqPTzGOkarc8CF0UVg4jvLYJqyKa3SzE5w'
  }
}

function formatPreparationTime(hours) {
  if (!Number.isFinite(hours) || hours <= 0) {
    return '24 h'
  }

  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24
    return `${days} dia${days === 1 ? '' : 's'}`
  }

  return `${hours} h`
}

function Navbar() {
  const [activePanel, setActivePanel] = useState(null)
  const {
    items,
    totalItems,
    totalPrice,
    addToCart,
    decreaseQuantity,
    removeFromCart,
    clearCart,
    estimatedPreparationHours,
    openPaymentView
  } = useCart()

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
                        <p className="navbar__cart-item-price">
                          Listo en aprox: {formatPreparationTime(item.preparationHours)}
                        </p>
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
                <p className="navbar__cart-total">
                  Pedido listo aprox en: {formatPreparationTime(estimatedPreparationHours)}
                </p>
                <div className="navbar__cart-actions">
                  <button
                    type="button"
                    className="navbar__cart-clear"
                    onClick={() => {
                      openPaymentView()
                      handleClose()
                    }}
                  >
                    Pasar a pago
                  </button>
                  <button type="button" className="navbar__cart-clear" onClick={clearCart}>
                    Vaciar carrito
                  </button>
                </div>
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
            {selectedContent.mapUrl && (
              <a
                className="navbar__panel-link"
                href={selectedContent.mapUrl}
                target="_blank"
                rel="noreferrer"
              >
                {selectedContent.mapLabel || 'Abrir mapa'}
              </a>
            )}
          </section>
        </div>
      )}
    </>
  )
}

export default Navbar
