import './navbar.css'
import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import logo from './assets/logo_bien.jpg'
import { useCart } from './context/CartContext'
import { PROMO_FILTER_KEY, KIRA_MILAN_FILTER_KEY, CATALOGO_2026_FILTER_KEY, CATALOGO_2025_FILTER_KEY, CATALOGO_2023_FILTER_KEY, CATALOGO_2024_FILTER_KEY, DIA_MADRES_FILTER_KEY, ENABLE_MOTHERS_DAY_CATALOG } from './constants/promoProducts'

const COURSE_PRODUCT_ID = 'Curso'
const COURSE_TIME = '10:00 am a 5:00 pm'
const COURSE_PLACE = 'Margot Expo'

const panelContent = {
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
  const prevTotalItemsRef = useRef(0)
  const navigate = useNavigate()
  const location = useLocation()
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
    isMothersDayCatalogLocked,
    flowerTypeTabs,
    clearSelectedFlower,
    closePaymentView,
    hasOnlyCourseItems
  } = useCart()
  const normalizedPath = location.pathname === '/' ? '/' : location.pathname.replace(/\/+$/, '')
  const effectiveSelectedFlowerType = isMothersDayCatalogLocked && ENABLE_MOTHERS_DAY_CATALOG ? DIA_MADRES_FILTER_KEY : selectedFlowerType
  const lockedCatalogMessage = ENABLE_MOTHERS_DAY_CATALOG
    ? 'Del 7 al 10 de mayo solo esta disponible el catalogo del Dia de las Madres.'
    : undefined
  const isCursosView = normalizedPath === '/cursos'
  const isFloresView = normalizedPath === '/' || normalizedPath.startsWith('/flores')

  useEffect(() => {
    if (prevTotalItemsRef.current === 0 && totalItems === 1) {
      setActivePanel('cart')
    }
    prevTotalItemsRef.current = totalItems
  }, [totalItems])

  const handleOpen = (panelKey) => {
    setActivePanel((current) => (current === panelKey ? null : panelKey))
  }

  const handleClose = () => {
    setActivePanel(null)
  }

  const handleOpenInfoPanel = (panelKey) => {
    setActivePanel(panelKey)
  }

  const handleGoToFlowers = () => {
    clearSelectedFlower()
    closePaymentView()
    handleClose()
    navigate('/')
  }

  const handleGoToCursos = () => {
    clearSelectedFlower()
    closePaymentView()
    handleClose()
    navigate('/cursos')
  }

  const canSelectFlowerType = (flowerType) => {
    if (!ENABLE_MOTHERS_DAY_CATALOG) {
      return true
    }

    return !isMothersDayCatalogLocked || flowerType === DIA_MADRES_FILTER_KEY
  }

  const handleSelectFlowerType = (flowerType) => {
    if (!canSelectFlowerType(flowerType)) {
      return
    }

    setSelectedFlowerType(flowerType)
    handleClose()
    clearSelectedFlower()
    closePaymentView()
    navigate('/')
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
          <span className="navbar__brand-copy">
            <span className="navbar__brand-text">Studio dei Fiori</span>
            <span className="navbar__brand-subtitle">Flores y cursos con entrega especial</span>
          </span>
        </button>

        <div className="navbar__actions">
          <div className="navbar__quick-links" role="group" aria-label="Accesos principales">
            <button
              type="button"
              className={`navbar__icon-button navbar__icon-button--text${isCursosView ? ' navbar__icon-button--text-active' : ''}`}
              onClick={handleGoToCursos}
              aria-label="Ir a cursos"
              aria-current={isCursosView ? 'page' : undefined}
            >
              <span className="navbar__nav-label">CURSOS</span>
            </button>
            <button
              type="button"
              className={`navbar__icon-button navbar__icon-button--text${isFloresView ? ' navbar__icon-button--text-active' : ''}`}
              onClick={handleGoToFlowers}
              aria-label="Ir a flores"
              aria-current={isFloresView ? 'page' : undefined}
            >
              <span className="navbar__nav-label">FLORES</span>
            </button>
          </div>

          <ul className="navbar__menu">
            <li className="navbar__menu-item navbar__menu-item--user">
              <button
                type="button"
                className="navbar__icon-button navbar__icon-button--user"
                onClick={() => handleOpen('contacto')}
                aria-expanded={activePanel === 'contacto'}
                aria-label="Contacto"
              >
                <span aria-hidden="true" className="navbar__icon navbar__icon--user" />
              </button>
            </li>
            <li className="navbar__menu-item navbar__menu-item--cart">
              <button
                type="button"
                className={`navbar__icon-button navbar__icon-button--cart navbar__cart-button ${totalItems > 0 ? 'navbar__cart-button--alert' : ''}`}
                onClick={() => handleOpen('cart')}
                aria-expanded={activePanel === 'cart'}
                aria-label={`Carrito con ${totalItems} producto${totalItems === 1 ? '' : 's'}`}
              >
                <span aria-hidden="true" className="navbar__icon navbar__icon--cart">
                  <span className="navbar__cart-basket" />
                  <span className="navbar__cart-wheel navbar__cart-wheel--left" />
                  <span className="navbar__cart-wheel navbar__cart-wheel--right" />
                </span>
                {totalItems > 0 && (
                  <span className="navbar__cart-badge" aria-hidden="true">
                    {totalItems > 99 ? '99+' : totalItems}
                  </span>
                )}
              </button>
            </li>
          </ul>
        </div>
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
              <div className="navbar__mobile-drawer-heading">
                <span className="navbar__mobile-drawer-title">Studio dei Fiori</span>
                <span className="navbar__mobile-drawer-subtitle">Flores, cursos y detalles vivos</span>
              </div>
              <button type="button" className="navbar__panel-close" onClick={handleClose} aria-label="Cerrar menu">
                x
              </button>
            </div>
            <div className="navbar__mobile-drawer-categories">
              <p className="navbar__mobile-drawer-section-title">Promociones</p>
              <button
                type="button"
                className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--promo${effectiveSelectedFlowerType === PROMO_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                onClick={() => handleSelectFlowerType(PROMO_FILTER_KEY)}
                disabled={!canSelectFlowerType(PROMO_FILTER_KEY)}
                title={!canSelectFlowerType(PROMO_FILTER_KEY) ? lockedCatalogMessage : undefined}
              >
                🌸 Ver ofertas especiales — $595 MXN
              </button>
              <button
                type="button"
                className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--collection${effectiveSelectedFlowerType === KIRA_MILAN_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                onClick={() => handleSelectFlowerType(KIRA_MILAN_FILTER_KEY)}
                disabled={!canSelectFlowerType(KIRA_MILAN_FILTER_KEY)}
                title={!canSelectFlowerType(KIRA_MILAN_FILTER_KEY) ? lockedCatalogMessage : undefined}
              >
                ✨ Kira Milan Collection 2025
              </button>
              {ENABLE_MOTHERS_DAY_CATALOG && (
                <button
                  type="button"
                  className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--dm${effectiveSelectedFlowerType === DIA_MADRES_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                  onClick={() => handleSelectFlowerType(DIA_MADRES_FILTER_KEY)}
                >
                  💐 Día de las Madres
                </button>
              )}
              <button
                type="button"
                className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--catalogo2026${effectiveSelectedFlowerType === CATALOGO_2026_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                onClick={() => handleSelectFlowerType(CATALOGO_2026_FILTER_KEY)}
                disabled={!canSelectFlowerType(CATALOGO_2026_FILTER_KEY)}
                title={!canSelectFlowerType(CATALOGO_2026_FILTER_KEY) ? lockedCatalogMessage : undefined}
              >
                🌹 Catálogo 2026
              </button>
              <button
                type="button"
                className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--catalogo2026${effectiveSelectedFlowerType === CATALOGO_2025_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                onClick={() => handleSelectFlowerType(CATALOGO_2025_FILTER_KEY)}
                disabled={!canSelectFlowerType(CATALOGO_2025_FILTER_KEY)}
                title={!canSelectFlowerType(CATALOGO_2025_FILTER_KEY) ? lockedCatalogMessage : undefined}
              >
                🌸 Catálogo 2025
              </button>
              <button
                type="button"
                className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--catalogo2026${effectiveSelectedFlowerType === CATALOGO_2024_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                onClick={() => handleSelectFlowerType(CATALOGO_2024_FILTER_KEY)}
                disabled={!canSelectFlowerType(CATALOGO_2024_FILTER_KEY)}
                title={!canSelectFlowerType(CATALOGO_2024_FILTER_KEY) ? lockedCatalogMessage : undefined}
              >
                🌻 Catálogo 2024
              </button>
              <button
                type="button"
                className={`navbar__mobile-drawer-link navbar__mobile-drawer-link--catalogo2026${effectiveSelectedFlowerType === CATALOGO_2023_FILTER_KEY ? ' navbar__mobile-drawer-link--active' : ''}`}
                onClick={() => handleSelectFlowerType(CATALOGO_2023_FILTER_KEY)}
                disabled={!canSelectFlowerType(CATALOGO_2023_FILTER_KEY)}
                title={!canSelectFlowerType(CATALOGO_2023_FILTER_KEY) ? lockedCatalogMessage : undefined}
              >
                🌸 Catálogo 2023
              </button>
            </div>
            <div className="navbar__mobile-drawer-categories">
              <p className="navbar__mobile-drawer-section-title">Menu</p>
              <button
                type="button"
                className="navbar__mobile-drawer-link"
                onClick={handleGoToFlowers}
              >
                Flores
              </button>
              <button
                type="button"
                className="navbar__mobile-drawer-link"
                onClick={handleGoToCursos}
              >
                Cursos
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
                    className={`navbar__mobile-drawer-link${effectiveSelectedFlowerType === tab.value ? ' navbar__mobile-drawer-link--active' : ''}`}
                    onClick={() => handleSelectFlowerType(tab.value)}
                    disabled={!canSelectFlowerType(tab.value)}
                    title={!canSelectFlowerType(tab.value) ? lockedCatalogMessage : undefined}
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
              <p className="navbar__panel-text">Aun no agregas productos al carrito.</p>
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
                        {item.itemType === 'course' || item.id === COURSE_PRODUCT_ID ? (
                          <p className="navbar__cart-item-price">
                            Curso: {COURSE_TIME} en {COURSE_PLACE}
                          </p>
                        ) : (
                          <p className="navbar__cart-item-price">
                            Listo en aprox: {formatPreparationTime(item.preparationHours)}
                          </p>
                        )}
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
                {!hasOnlyCourseItems && (
                  <p className="navbar__cart-total">
                    Pedido listo aprox en: {formatPreparationTime(estimatedPreparationHours)}
                  </p>
                )}
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

