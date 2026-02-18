import './navbar.css'

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar__logo">
        <span className="navbar__logo-mark" aria-hidden="true" />
        <span>Studio DFlori</span>
      </div>

      <div className="navbar__actions">
        <button className="navbar__button" type="button">
          Contacto
        </button>
        <button className="navbar__button" type="button">
          Quienes Somos
        </button>
        <button className="navbar__button" type="button">
          Direccion
        </button>
      </div>
    </nav>
  )
}

export default Navbar
