import './MainContent.css'
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import TopMenu from './Top_menu.jsx'
import FloresMenu from './Flores_menu.jsx'
import Pago from './Pago.jsx'
import Tarjeta from './Tarjeta.jsx'
import Visualizacion from './visualización.jsx'
import Cursos from './cursos.jsx'
import { useCart } from '../context/CartContext'
import { trackViewItem } from '../lib/analytics'

function MainContent() {
  const location = useLocation()
  const { isPaymentView, isCardView, selectedFlower } = useCart()
  const isCursosView = location.pathname.replace(/\/+$/, '') === '/cursos'
  const trackedProductIdRef = useRef('')

  useEffect(() => {
    if (!selectedFlower) {
      trackedProductIdRef.current = ''
      return
    }

    if (isPaymentView || trackedProductIdRef.current === selectedFlower.id) {
      return
    }

    trackedProductIdRef.current = selectedFlower.id
    trackViewItem(selectedFlower)
  }, [isPaymentView, selectedFlower])

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
