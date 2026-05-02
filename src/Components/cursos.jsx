import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import './cursos.css'
import { supabase } from '../lib/supabaseClient'
import { useCart } from '../context/CartContext'

const COURSE_PRODUCT_ID = 'Curso'
const COURSE_NAME = 'Curso intensivo floral para principiantes'
const COURSE_ORIGINAL_PRICE = 4500
const COURSE_FALLBACK_PRICE = 3000
const COURSE_PLACE = 'Margot Expo'
const COURSE_TIME = '10:00 am a 5:00 pm'
const COURSE_TABLES = ['productos', 'Curso', 'curso']
const SITE_URL = 'https://www.studiodeifiori.com'

const courseImageModules = import.meta.glob('../assets/Curso/*.webp', { eager: true, import: 'default' })

function sortAssetEntries([leftPath], [rightPath]) {
  return leftPath.localeCompare(rightPath, undefined, { numeric: true, sensitivity: 'base' })
}

const courseImages = Object.entries(courseImageModules)
  .sort(sortAssetEntries)
  .map(([, src]) => src)

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveCoursePrice(courseRecord) {
  return toNumber(
    courseRecord?.precio
    ?? courseRecord?.price
    ?? courseRecord?.costo
    ?? courseRecord?.monto
    ?? courseRecord?.precio_reserva
    ?? courseRecord?.precioReserva
  )
}

function resolveCourseStock(courseRecord) {
  return toNumber(
    courseRecord?.stock
    ?? courseRecord?.cupo
    ?? courseRecord?.lugares
    ?? courseRecord?.available
  )
}

function resolveCourseName(courseRecord) {
  return String(
    courseRecord?.nombre
    ?? courseRecord?.name
    ?? courseRecord?.titulo
    ?? COURSE_NAME
  ).trim() || COURSE_NAME
}

async function fetchCourseFromTable(tableName) {
  const byIdResponse = await supabase
    .from(tableName)
    .select('*')
    .eq('id', COURSE_PRODUCT_ID)
    .maybeSingle()

  if (byIdResponse.data) {
    return byIdResponse
  }

  if (tableName === 'productos') {
    return byIdResponse
  }

  const fallbackResponse = await supabase
    .from(tableName)
    .select('*')
    .limit(1)

  if (fallbackResponse.error) {
    return fallbackResponse
  }

  return {
    data: Array.isArray(fallbackResponse.data) ? fallbackResponse.data[0] : fallbackResponse.data,
    error: null
  }
}

function Cursos() {
  const navigate = useNavigate()
  const { items, addToCart, openPaymentView, setDeliveryDetails } = useCart()
  const [courseRecord, setCourseRecord] = useState(null)
  const [courseStatus, setCourseStatus] = useState(supabase ? 'loading' : 'unavailable')
  const [courseError, setCourseError] = useState('')
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  useEffect(() => {
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadCourse() {
      if (!supabase) {
        setCourseStatus('unavailable')
        return
      }

      setCourseStatus('loading')
      setCourseError('')

      for (const tableName of COURSE_TABLES) {
        const { data, error } = await fetchCourseFromTable(tableName)

        if (!isMounted) {
          return
        }

        if (!error && data) {
          setCourseRecord(data)
          setCourseStatus(data.activo === false || data.active === false ? 'inactive' : 'ready')
          return
        }

        if (error) {
          setCourseError(error.message)
        }
      }

      setCourseStatus('error')
    }

    loadCourse()

    return () => {
      isMounted = false
    }
  }, [])

  const currentImage = courseImages[currentImageIndex] || courseImages[0] || ''
  const coursePrice = resolveCoursePrice(courseRecord)
  const courseStock = resolveCourseStock(courseRecord)
  const courseName = resolveCourseName(courseRecord)
  const hasFlowerItemsInCart = items.some((item) => item.itemType !== 'course' && item.id !== COURSE_PRODUCT_ID)
  const canReserve = courseStatus === 'ready'
    && typeof coursePrice === 'number'
    && coursePrice > 0
    && (typeof courseStock !== 'number' || courseStock > 0)
    && !hasFlowerItemsInCart
  const displayPrice = typeof coursePrice === 'number' ? coursePrice : COURSE_FALLBACK_PRICE
  const whatsappText = encodeURIComponent('Hola, quiero informacion para reservar mi lugar en el Curso intensivo floral para principiantes.')
  const whatsappUrl = `https://wa.me/523310259546?text=${whatsappText}`

  const courseProduct = useMemo(() => ({
    id: COURSE_PRODUCT_ID,
    name: courseName,
    image: currentImage,
    images: courseImages,
    price: typeof coursePrice === 'number' ? coursePrice : null,
    preparationHours: 0,
    itemType: 'course',
    fulfillmentType: 'course',
    coursePlace: COURSE_PLACE,
    courseTime: COURSE_TIME
  }), [courseName, coursePrice, currentImage])

  const prepareCourseCheckout = () => {
    setDeliveryDetails((current) => ({
      ...current,
      fulfillmentType: 'course',
      recipientType: 'self',
      recipientName: '',
      streetAddress: '',
      neighborhood: '',
      postalCode: '',
      flowerMessage: ''
    }))
  }

  const handleGoToFlowers = () => {
    navigate('/')
  }

  const handleAddCourse = () => {
    if (!canReserve) {
      return
    }

    prepareCourseCheckout()
    addToCart(courseProduct)
  }

  const handleReserveAndPay = () => {
    if (!canReserve) {
      return
    }

    prepareCourseCheckout()
    addToCart(courseProduct)
    openPaymentView()
    navigate('/pago')
  }

  const showPreviousImage = () => {
    setCurrentImageIndex((current) => (
      courseImages.length ? (current - 1 + courseImages.length) % courseImages.length : 0
    ))
  }

  const showNextImage = () => {
    setCurrentImageIndex((current) => (
      courseImages.length ? (current + 1) % courseImages.length : 0
    ))
  }

  return (
    <>
      <Helmet>
        <title>Curso intensivo floral | Studio dei Fiori</title>
        <meta
          name="description"
          content="Curso intensivo teorico-practico para principiantes en Margot Expo. Aprende flores, herramientas, color y armado de bouquets."
        />
        <link rel="canonical" href={`${SITE_URL}/cursos`} />
      </Helmet>

      <section className="cursos" aria-label="Curso intensivo floral">
        <div className="cursos__hero">
          <div className="cursos__hero-copy">
            <p className="cursos__eyebrow">Curso intensivo para principiantes</p>
            <h1 className="cursos__title">Adentrate en el mundo de las flores</h1>
            <p className="cursos__lead">
              Un curso teorico-practico para aprender desde cero, trabajar arreglos reales y llevarte tus piezas terminadas.
            </p>
            <div className="cursos__facts" aria-label="Datos del curso">
              <span>{COURSE_TIME}</span>
              <span>{COURSE_PLACE}</span>
              <span>Incluye materiales, comida y constancia</span>
            </div>
            <div className="cursos__hero-actions">
              <button type="button" className="cursos__link-button" onClick={handleGoToFlowers}>
                Volver a flores
              </button>
            </div>
          </div>

          {currentImage && (
            <div className="cursos__gallery" aria-label="Galeria del curso">
              <img className="cursos__image" src={currentImage} alt="Curso floral Studio dei Fiori" decoding="async" />
              {courseImages.length > 1 && (
                <>
                  <button type="button" className="cursos__gallery-nav cursos__gallery-nav--left" onClick={showPreviousImage} aria-label="Imagen anterior">
                    &#8249;
                  </button>
                  <button type="button" className="cursos__gallery-nav cursos__gallery-nav--right" onClick={showNextImage} aria-label="Imagen siguiente">
                    &#8250;
                  </button>
                  <span className="cursos__gallery-counter">{currentImageIndex + 1}/{courseImages.length}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="cursos__thumbs" aria-label="Imagenes del curso">
          {courseImages.map((image, index) => (
            <button
              key={image}
              type="button"
              className={`cursos__thumb${index === currentImageIndex ? ' cursos__thumb--active' : ''}`}
              onClick={() => setCurrentImageIndex(index)}
              aria-label={`Ver foto ${index + 1} del curso`}
            >
              <img src={image} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>

        <div className="cursos__body">
          <section className="cursos__section">
            <details className="cursos__disclosure">
              <summary className="cursos__summary">
                <span>
                  <span className="cursos__summary-title">Que aprenderas</span>
                  <span className="cursos__summary-note">Temario teorico-practico para empezar desde cero</span>
                </span>
                <span className="cursos__summary-icon" aria-hidden="true">+</span>
              </summary>
              <div className="cursos__disclosure-content">
                <p>
                  Es un curso intensivo para principiantes. Es de {COURSE_TIME} en {COURSE_PLACE}.
                  Este curso es teorico-practico abarcando los temas:
                </p>
                <ul className="cursos__list cursos__list--grid">
                  <li>Flores</li>
                  <li>Tipos de flores</li>
                  <li>Cuidados de las flores</li>
                  <li>Sus herramientas</li>
                  <li>Historia</li>
                  <li>Teoria del color</li>
                </ul>
              </div>
            </details>
          </section>

          <section className="cursos__section">
            <details className="cursos__disclosure">
              <summary className="cursos__summary">
                <span>
                  <span className="cursos__summary-title">Arreglos que se trabajan</span>
                  <span className="cursos__summary-note">Tres piezas principales para practicar tecnica y composicion</span>
                </span>
                <span className="cursos__summary-icon" aria-hidden="true">+</span>
              </summary>
              <div className="cursos__disclosure-content">
                <ul className="cursos__list cursos__list--featured">
                  <li>Bouquet en espiral</li>
                  <li>Bouquet escalonado</li>
                  <li>Arreglo en canasta</li>
                </ul>
              </div>
            </details>
          </section>

          <section className="cursos__section">
            <details className="cursos__disclosure">
              <summary className="cursos__summary">
                <span>
                  <span className="cursos__summary-title">Incluye todo</span>
                  <span className="cursos__summary-note">Materiales, comida, constancia y experiencia completa</span>
                </span>
                <span className="cursos__summary-icon" aria-hidden="true">+</span>
              </summary>
              <div className="cursos__disclosure-content">
                <ul className="cursos__list cursos__list--grid">
                  <li>Kit de herramientas</li>
                  <li>Manual</li>
                  <li>Flores</li>
                  <li>Coffee break</li>
                  <li>Comida</li>
                  <li>Constancia</li>
                  <li>Vino</li>
                  <li>Fotografo profesional</li>
                  <li>Sus arreglos se los llevan</li>
                  <li>Seguimiento en grupo</li>
                </ul>
              </div>
            </details>
          </section>

          <section className="cursos__checkout" aria-label="Reserva del curso">
            <div>
              <p className="cursos__price-label">Costo del curso</p>
              <p className="cursos__price">
                <s>${COURSE_ORIGINAL_PRICE.toLocaleString('es-MX')} MXN</s>
                <span>${displayPrice.toLocaleString('es-MX')} MXN</span>
              </p>
              <p className="cursos__price-note">
                Su costo es de $4,500 pesos pero si reserva quedara en ${displayPrice.toLocaleString('es-MX')} pesos.
              </p>
              {courseStatus === 'loading' && <p className="cursos__status">Cargando precio desde Supabase...</p>}
              {courseStatus === 'unavailable' && <p className="cursos__status">Configura Supabase para habilitar reservas en linea.</p>}
              {courseStatus === 'inactive' && <p className="cursos__status cursos__status--warning">El curso esta inactivo por el momento.</p>}
              {courseStatus === 'error' && <p className="cursos__status cursos__status--warning">No se pudo cargar el curso desde Supabase{courseError ? `: ${courseError}` : '.'}</p>}
              {typeof courseStock === 'number' && courseStock <= 0 && (
                <p className="cursos__status cursos__status--warning">Lugares agotados.</p>
              )}
              {hasFlowerItemsInCart && (
                <p className="cursos__status cursos__status--warning">Para pagar el curso, termina o vacia primero tu pedido de flores.</p>
              )}
            </div>

            <div className="cursos__actions">
              <button type="button" className="cursos__button" onClick={handleReserveAndPay} disabled={!canReserve}>
                Reservar y pagar
              </button>
              <button type="button" className="cursos__button cursos__button--secondary" onClick={handleAddCourse} disabled={!canReserve}>
                Agregar al carrito
              </button>
              <button type="button" className="cursos__button cursos__button--ghost" onClick={handleGoToFlowers}>
                Ver flores
              </button>
              <a className="cursos__whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer">
                Preguntar por WhatsApp
              </a>
            </div>
          </section>

          <p className="cursos__closing">
            Es excelente para principiantes que desean adentrarse en el mundo de las flores y una grandiosa oportunidad
            para aprovechar la temporada alta de flores.
          </p>
        </div>
      </section>
    </>
  )
}

export default Cursos
