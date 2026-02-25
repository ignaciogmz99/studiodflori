import './MainContent.css'
import TopMenu from './Top_menu.jsx'
import FloresMenu from './Flores_menu.jsx'
import Pago from './Pago.jsx'
import { useCart } from '../context/CartContext'

function MainContent() {
  const { isPaymentView } = useCart()

  return (
    <main className="main-content" aria-label="Contenido principal">
      {isPaymentView
        ? <Pago />
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
