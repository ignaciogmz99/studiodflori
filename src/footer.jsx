import './footer.css'

const FACEBOOK_URL = 'https://facebook.com/tu-pagina'
const INSTAGRAM_URL = 'https://www.instagram.com/studiodeifiori?igsh=Zzlja3ZmeGg1Y3Bv&utm_source=qr'
const WHATSAPP_URL = 'https://wa.me/5213312345678?text=Hola%20quiero%20hacer%20un%20pedido'

function Footer() {
  return (
    <footer className="footer" aria-label="Redes sociales">
      <div className="footer__actions">
        <a
          className="footer__button footer__button--facebook"
          href={FACEBOOK_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Facebook"
        >
          Facebook
        </a>
        <a
          className="footer__button footer__button--instagram"
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram"
        >
          Instagram
        </a>
        <a
          className="footer__button footer__button--whatsapp"
          href={WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="WhatsApp"
        >
          WhatsApp
        </a>
      </div>
    </footer>
  )
}

export default Footer
