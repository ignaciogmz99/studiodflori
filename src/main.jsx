import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import GoogleTagBridge from './GoogleTagBridge.jsx'

createRoot(document.getElementById('root')).render(
  <HelmetProvider>
    <BrowserRouter>
      <GoogleTagBridge />
      <CartProvider>
        <App />
      </CartProvider>
    </BrowserRouter>
  </HelmetProvider>,
)
