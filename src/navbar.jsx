import './navbar.css'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from './assets/logo_bien.jpg'
import { useCart } from './context/CartContext'
import { PROMO_FILTER_KEY, KIRA_MILAN_FILTER_KEY, CATALOGO_2026_FILTER_KEY, CATALOGO_2025_FILTER_KEY, CATALOGO_2023_FILTER_KEY, CATALOGO_2024_FILTER_KEY } from './constants/promoProducts'

const panelContent = {
  regalos: {
    title: 'Regalos',
    heading: 'Sugerencias de regalo',
    text: 'Arreglos personalizados, cajas florales y detalles para fechas especiales. Muy pronto agregaremos el catalogo completo.'
  },
  contacto: {
    title: 'Contacto',
    heading: 'Habla con nosotros',
    text: 'Escribenos para pedidos, cotizaciones o dudas sobre disponibilidad. WhatsApp: +52 33 1025 9546. Horario de atencion: Lunes a Sabado de 9:00 a 18:00.',
    facebook: 'https://www.facebook.com/share/1HVJZRXdDL/?mibextid=wwXIfr',
    instagram: 'https://www.instagram.com/studiodeifiori?igsh=Zzlja3ZmeGg1Y3Bv&utm_source=qr'
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
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const navigate = useNavigate()
  const {
    items,
    totalItems,
    totalPrice,
    addToCart,
    decreaseQuantity,
    removeFromCart,
    clearCart,
    estimatedPreparationHours,
    openPaymentView,
    selectedFlowerType,
    setSelectedFlowerType,
    flowerTypeTabs,
    clearSelectedFlower,
    closePaymentView
  } = useCart()

  const handleOpen = (panelKey) => {
    setActivePanel((current) => (current === panelKey ? null : panelKey))
  }

  const handleClose = () => {
    setActivePanel(null)
  }

  const handleOpenInfoPanel = (panelKey) => {
    setActivePanel(panelKey)
  }

  const selectedContent = activePanel ? panelContent[activePanel] : null

  return (
    <>
      <nav className="navbar" aria-label="Barra principal">
        <button
          type="button"
          className="navbar__mobile-menu-button"
          onClick={() => handleOpen('mobile-menu')}
          aria-expanded={activePanel === 'mobile-menu'}
          aria-label="Abrir menu principal"
        >
          <span className="navbar__mobile-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        <button
          type="button"
          className="navbar__brand"
          aria-label="Ir a la página principal"
          onClick={() => { clearSelectedFlower(); closePaymentView(); handleClose(); navigate('/') }}
        >
          <span className="navbar__brand-icon-wrap">
            <img className="navbar__logo-image" src={logo} alt="Logo de Studio dei Fiori" />
          </span>
          <span className="navbar__brand-text">Studio dei Fiori</span>
        </button>

        <ul className="navbar__menu">
          <li className="navbar__menu-item navbar__menu-item--desktop">
            <button
              type="button"
              className="navbar__link navbar__link-button"
              onClick={() => handleOpen('regalos')}
              aria-expanded={activePanel === 'regalos'}
            >
              Regalos
            </button>
          </li>
          <li className="navbar__menu-item navbar__menu-item--desktop">
            <button
              type="button"
              className="navbar__link navbar__link-button"
              onClick={() => handleOpen('contacto')}
              aria-expanded={activePanel === 'contacto'}
            >
              Contacto
            </button>
          </li>
          <li className="navbar__menu-item navbar__menu-item--desktop">
            <button
              type="button"
              className="navbar__link navbar__link-button"
              onClick={() => handleOpen('direccion')}
              aria-expanded={activePanel === 'direccion'}
            >
              Direccion
            </button>
          </li>
          <li className="navbar__menu-item navbar__menu-item--cart">
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

      {activePanel === 'mobile-menu' && (
        <div className="navbar__mobile-drawer-backdrop" onClick={handleClose}>
          <section
            className="navbar__mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="navbar__mobile-drawer-header">
              <span className="navbar__mobile-drawer-title">Menu</span>
              <button type="button" className="navbar__panel-close" onClick={handleClose} aria-label="Cerrar">
                x
              </button>
            </div>
            <div className="navbar__mobile-drawer-categories">
              <p className="navbar__mobile-drawer-section-title">Promociones</p>
              <button
                type="button"
                className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--promo${selectedFlowerType === PROMO_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                onClick={() => { setSelectedFlowerType(PROMO_FILTER_KEY); handleClose() }}
              >
                🌸 Ver ofertas especiales — $595 MXN
              </button>
              <button
                type="button"
                className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--collection${selectedFlowerType === KIRA_MILAN_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                onClick={() => { setSelectedFlowerType(KIRA_MILAN_FILTER_KEY); handleClose() }}
              >
                ✨ Kira Milan Collection 2025
              </button>
              <button
                type="button"
                className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--catalogo2026${selectedFlowerType === CATALOGO_2026_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                onClick={() => { setSelectedFlowerType(CATALOGO_2026_FILTER_KEY); handleClose() }}
              >
                🌹 Catálogo 2026
              </button>
              <button
                type="button"
                className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--catalogo2026${selectedFlowerType === CATALOGO_2025_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                onClick={() => { setSelectedFlowerType(CATALOGO_2025_FILTER_KEY); handleClose() }}
              >
                🌸 Catálogo 2025
              </button>
              <button
                type="button"
                className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--catalogo2026${selectedFlowerType === CATALOGO_2024_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                onClick={() => { setSelectedFlowerType(CATALOGO_2024_FILTER_KEY); handleClose() }}
              >
                🌻 Catálogo 2024
              </button>
              <button
                type="button"
                className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--catalogo2026${selectedFlowerType === CATALOGO_2023_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                onClick={() => { setSelectedFlowerType(CATALOGO_2023_FILTER_KEY); handleClose() }}
              >
                🌸 Catálogo 2023
              </button>
            </div>
            <div className="navbar__mobile-drawer-categories">
              <p className="navbar__mobile-drawer-section-title">Menu</p>
              <button
                type="button"
                className="navbar__mobile-drawer-link"
                onClick={() => handleOpenInfoPanel('regalos')}
              >
                Regalos
              </button>
              <button
                type="button"
                className="navbar__mobile-drawer-link"
                onClick={() => handleOpenInfoPanel('contacto')}
              >
                Contacto
              </button>
              <button
                type="button"
                className="navbar__mobile-drawer-link"
                onClick={() => handleOpenInfoPanel('direccion')}
              >
                Direccion
              </button>
            </div>
            {flowerTypeTabs.length > 0 && (
              <div className="navbar__mobile-drawer-categories">
                <button
                  type="button"
                  className="navbar__mobile-drawer-section-toggle"
                  onClick={() => setCategoriesOpen((v) => !v)}
                >
                  <span>Categorias</span>
                  <span className={`navbar__mobile-drawer-section-arrow${categoriesOpen ? ' navbar__mobile-drawer-section-arrow--open' : ''}`}>▾</span>
                </button>
                {categoriesOpen && flowerTypeTabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    className={`navbar__mobile-drawer-link${selectedFlowerType === tab.value ? ' navbar__mobile-drawer-link--active' : ''}`}
                    onClick={() => { setSelectedFlowerType(tab.value); handleClose() }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

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
                      navigate('/pago')
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
            {(selectedContent.facebook || selectedContent.instagram) && (
              <div className="navbar__panel-social">
                {selectedContent.facebook && (
                  <a className="navbar__panel-social-btn navbar__panel-social-btn--fb" href={selectedContent.facebook} target="_blank" rel="noreferrer">
                    Facebook
                  </a>
                )}
                {selectedContent.instagram && (
                  <a className="navbar__panel-social-btn navbar__panel-social-btn--ig" href={selectedContent.instagram} target="_blank" rel="noreferrer">
                    Instagram
                  </a>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

export default Navbar
