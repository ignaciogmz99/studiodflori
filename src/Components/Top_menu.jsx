import './Top_menu.css'

function TopMenu() {
  return (
    <section className="top-menu" aria-label="Destino de entrega">
      <h2 className="top-menu__title">Enviar a:</h2>

      <button type="button" className="top-menu__field" aria-label="Seleccionar ciudad de entrega">
        <span className="top-menu__icon" aria-hidden="true">
        </span>
        <span className="top-menu__text">Guadalajara</span>
      </button>

      <button type="button" className="top-menu__field" aria-label="Seleccionar fecha de entrega">
        <span className="top-menu__icon" aria-hidden="true">
          
        </span>
        <span className="top-menu__text">Miercoles 18 de febrero</span>
      </button>
    </section>
  )
}

export default TopMenu
