import ShippingPolicy from './ShippingPolicy.jsx'

function ShippingPolicyPanel({ onClose }) {
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
          x
        </button>
        <ShippingPolicy />
      </section>
    </div>
  )
}

export default ShippingPolicyPanel
