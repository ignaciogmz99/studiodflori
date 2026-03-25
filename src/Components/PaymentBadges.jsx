import './PaymentBadges.css'

const BADGES = [
  {
    id: 'mp',
    label: 'Mercado Pago',
    svg: (
      <svg viewBox="0 0 48 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="48" height="32" rx="5" fill="#00B1EA"/>
        <path d="M8 22V10l4.5 7.5L17 10v12h-2.5v-6.5L12.5 19 11 15.5V22H8z" fill="#fff"/>
        <path d="M21 10h2.5c2.5 0 4.5 1.8 4.5 4.5 0 2.6-2 4.5-4.5 4.5H23.5V22H21V10zm2.5 7c1.1 0 2-.9 2-2.5s-.9-2.5-2-2.5H23.5v5H23.5z" fill="#fff"/>
        <path d="M32 18l-1.5 4H28l5-12 5 12h-2.5L34 18h-2zm1-2.8l-.8 2.1h1.6l-.8-2.1z" fill="#fff"/>
      </svg>
    )
  },
  {
    id: 'visa',
    label: 'Visa',
    svg: (
      <svg viewBox="0 0 48 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="48" height="32" rx="5" fill="#1A1F71"/>
        <text x="24" y="22" textAnchor="middle" fill="#fff" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="700" letterSpacing="1">VISA</text>
      </svg>
    )
  },
  {
    id: 'mastercard',
    label: 'Mastercard',
    svg: (
      <svg viewBox="0 0 48 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="48" height="32" rx="5" fill="#252525"/>
        <circle cx="18" cy="16" r="8" fill="#EB001B"/>
        <circle cx="30" cy="16" r="8" fill="#F79E1B"/>
        <path d="M24 9.5a8 8 0 0 1 0 13A8 8 0 0 1 24 9.5z" fill="#FF5F00"/>
      </svg>
    )
  },
  {
    id: 'amex',
    label: 'American Express',
    svg: (
      <svg viewBox="0 0 48 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="48" height="32" rx="5" fill="#2E77BC"/>
        <text x="24" y="20" textAnchor="middle" fill="#fff" fontFamily="Arial, sans-serif" fontSize="8.5" fontWeight="700" letterSpacing="0.5">AMERICAN</text>
        <text x="24" y="27" textAnchor="middle" fill="#fff" fontFamily="Arial, sans-serif" fontSize="8.5" fontWeight="700" letterSpacing="0.5">EXPRESS</text>
      </svg>
    )
  },
  {
    id: 'oxxo',
    label: 'OXXO',
    svg: (
      <svg viewBox="0 0 48 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="48" height="32" rx="5" fill="#DA0016"/>
        <text x="24" y="22" textAnchor="middle" fill="#FFD700" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="900" letterSpacing="1">OXXO</text>
      </svg>
    )
  },
  {
    id: 'spei',
    label: 'Transferencia SPEI',
    svg: (
      <svg viewBox="0 0 48 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="48" height="32" rx="5" fill="#005F9E"/>
        <rect x="10" y="20" width="28" height="3" rx="1.5" fill="#fff"/>
        <rect x="12" y="12" width="4" height="8" fill="#fff"/>
        <rect x="19" y="14" width="4" height="6" fill="#fff"/>
        <rect x="26" y="10" width="4" height="10" fill="#fff"/>
        <rect x="33" y="15" width="4" height="5" fill="#fff"/>
        <path d="M8 9l4-3 4 3" stroke="#fff" strokeWidth="1.5" fill="none"/>
      </svg>
    )
  }
]

function PaymentBadges({ compact = false }) {
  return (
    <div className={`payment-badges${compact ? ' payment-badges--compact' : ''}`}>
      {!compact && (
        <p className="payment-badges__label">Métodos de pago aceptados</p>
      )}
      <ul className="payment-badges__list" aria-label="Métodos de pago aceptados">
        {BADGES.map((badge) => (
          <li key={badge.id} className="payment-badges__item" title={badge.label}>
            {badge.svg}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default PaymentBadges
