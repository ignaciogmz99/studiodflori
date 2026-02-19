import './footer.css'

function Footer() {
  return (
    <footer className="footer" aria-label="Redes sociales">
      <div className="footer__actions">
        <a className="footer__button footer__button--facebook" href="#" aria-label="Facebook">
          Facebook
        </a>
        <a className="footer__button footer__button--instagram" href="#" aria-label="Instagram">
          Instagram
        </a>
        <a className="footer__button footer__button--whatsapp" href="#" aria-label="WhatsApp">
          WhatsApp
        </a>
      </div>
    </footer>
  )
}

export default Footer
