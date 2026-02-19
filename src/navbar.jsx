import './navbar.css'
import { useState } from 'react'
import logo from './assets/logo_bien.jpg'

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
        </ul>
      </nav>

      {selectedContent && (
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
