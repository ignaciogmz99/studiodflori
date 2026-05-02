import './MainContent.css'
import { useLocation } from 'react-router-dom'
import TopMenu from './Top_menu.jsx'
import FloresMenu from './Flores_menu.jsx'
import Pago from './Pago.jsx'
import Tarjeta from './Tarjeta.jsx'
import Visualizacion from './visualización.jsx'
import Cursos from './cursos.jsx'
import { useCart } from '../context/CartContext'

function MainContent() {
  const location = useLocation()
  const { isPaymentView, isCardView, selectedFlower } = useCart()
  const isCursosView = location.pathname.replace(/\/+$/, '') === '/cursos'

  return (
    <main className={`main-content${selectedFlower ? ' main-content--viz' : ''}${isCursosView ? ' main-content--cursos' : ''}`} aria-label="Contenido principal">
      {isCursosView
        ? <Cursos />
        : isPaymentView
          ? (isCardView ? <Tarjeta /> : <Pago />)
          : selectedFlower
            ? <Visualizacion key={selectedFlower.id} />
            : (
              <>
                <TopMenu />
                <FloresMenu />
              </>
              )}
    </main>
  )
}

export default MainContent
