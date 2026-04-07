import './App.css'
import { useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import Navbar from './navbar.jsx'
import MainContent from './Components/MainContent.jsx'
import ProductLoader from './Components/ProductLoader.jsx'
import { useCart } from './context/CartContext.jsx'

function CatalogRoute() {
  const { clearSelectedFlower, closePaymentView } = useCart()
  useEffect(() => {
    clearSelectedFlower()
    closePaymentView()
  }, [clearSelectedFlower, closePaymentView])
  return <MainContent />
}

function PaymentRoute() {
  const { items, openPaymentView, isPaymentView } = useCart()
  const navigate = useNavigate()
  useEffect(() => {
    if (items.length === 0) {
      navigate('/', { replace: true })
      return
    }
    if (!isPaymentView) {
      openPaymentView()
    }
  }, [items.length]) // eslint-disable-line react-hooks/exhaustive-deps
  return <MainContent />
}

function App() {
  return (
    <div className="app">
      <Navbar />
      <Routes>
        <Route path="/flores/:id" element={<><ProductLoader /><MainContent /></>} />
        <Route path="/pago" element={<PaymentRoute />} />
        <Route path="/*" element={<CatalogRoute />} />
      </Routes>
    </div>
  )
}

export default App
