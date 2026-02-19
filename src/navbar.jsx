import './navbar.css'
import logo from './assets/logo.jpeg'

function Navbar() {
  return (
    <nav className="navbar" aria-label="Barra principal">
      <a className="navbar__brand" href="#" aria-label="Studio del Flori">
        <span className="navbar__brand-icon-wrap">
          <img className="navbar__logo-image" src={logo} alt="Logo de Studio del Flori" />
        </span>
        <span className="navbar__brand-text">studiodelflori</span>
      </a>

      <ul className="navbar__menu">
        <li>
          <a className="navbar__link" href="#">
            Tipo De Flor 
          </a>
        </li>
        <li>
          <a className="navbar__link" href="#">
            Regalos 
          </a>
        </li>
        <li>
          <a className="navbar__link" href="#">
            Contacto
          </a>
        </li>
        <li>
          <a className="navbar__link" href="#">
            Ayuda 
          </a>
        </li>
      </ul>
    </nav>
  )
}

export default Navbar
