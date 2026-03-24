import './MainContent.css'
import TopMenu from './Top_menu.jsx'
import FloresMenu from './Flores_menu.jsx'
import Pago from './Pago.jsx'
import Tarjeta from './Tarjeta.jsx'
import Visualización from './visualización.jsx'
import { useCart } from '../context/CartContext'

function MainContent() {
  const { isPaymentView, isCardView, selectedFlower } = useCart()

  return (
    <main className={`main-content${selectedFlower ? ' main-content--viz' : ''}`} aria-label="Contenido principal">
      {isPaymentView
        ? (isCardView ? <Tarjeta /> : <Pago />)
        : selectedFlower
          ? <Visualización key={selectedFlower.id} />
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
