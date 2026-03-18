import { useEffect } from 'react'
import ShippingPolicy from './ShippingPolicy.jsx'

function ShippingPolicyPanel({ onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="top-menu__policy-backdrop" onClick={onClose}>
      <section
        className="top-menu__policy-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Politica de envio"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="top-menu__policy-close"
          onClick={onClose}
          aria-label="Cerrar politica de envio"
        >
          ✕
        </button>
        <ShippingPolicy />
      </section>
    </div>
  )
}

export default ShippingPolicyPanel
