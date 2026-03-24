import { forwardRef, useEffect, useMemo, useState } from 'react'
import DatePicker from 'react-datepicker'
import { es } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'
import './visualización.css'
import { useCart } from '../context/CartContext'
import { DELIVERY_CITIES } from '../constants/deliveryCities'

const POETIC_DESCRIPTIONS = {
  Amalfi:
    'Como el perfume del mar en una tarde de verano, el Amalfi lleva en sus pétalos el espíritu de la costa italiana — luminoso, cálido y lleno de vida.',
  Bouquet:
    'Un abrazo hecho flores. Cada tallo escogido a mano para decir lo que las palabras no siempre alcanzan.',
  Bouquet_Gerberas:
    'Gerberas que ríen al sol. Su color es una declaración de alegría, un recordatorio de que la vida también florece en los días simples.',
  Bouquet_rosas:
    'Clásicas e intemporales, las rosas guardan en cada capa de sus pétalos un secreto de amor que nunca pasa de moda.',
  Bouquet_rosas_2:
    'Dos corazones, una misma historia. Este ramo de rosas es el lenguaje silencioso de quienes no necesitan más que un gesto para decirlo todo.',
  Bouquet_rosas_gerbera:
    'La elegancia de las rosas y la alegría de las gerberas se encuentran aquí, como si la primavera hubiera decidido no elegir favoritos.',
  Caja_floral_Dorian:
    'Una caja que guarda el tiempo. Como un retrato que no envejece, estas flores permanecen en la memoria de quien las recibe.',
  Carollo:
    'De nombre italiano y alma florentina, el Carollo es una composición que parece arrancada de un jardín renacentista en plena flor.',
  Ceramica_Beige:
    'La calidez de la tierra moldea el recipiente; la delicadeza de las flores, el alma. Juntos crean algo que se queda en los ojos y en el corazón.',
  Floral_iris:
    'El iris es el mensajero de los dioses en el jardín. Su color es el del horizonte justo antes de que la noche ceda ante el amanecer.',
  Giardino_Rosa:
    'Un jardín rosado que susurra en italiano. Cada flor es una nota en una canción que habla de belleza sin pretensión.',
  Jarron_con_Girasoles:
    'Los girasoles nunca mienten — siempre miran hacia la luz. Llévalos contigo y llevarás un poco de sol a donde quiera que vayas.',
  Kira:
    'Brillante como su nombre, Kira es una flor que ilumina la habitación con su sola presencia, sin pedir nada a cambio.',
  London:
    'Con la elegancia contenida de una mañana brumosa en el Támesis, London es la rosa que prefiere el silencio de lo hermoso a cualquier alarde.',
  Mauve:
    'En el espacio entre el rosa y el lila vive Mauve — ese color que no termina de decidirse y por eso resulta irresistible.',
  Ramo_de_Ranunculus:
    'Los ranúnculos son el secreto mejor guardado de los jardines. Sus capas infinitas de pétalos parecen pintadas por alguien que nunca supo cuándo detenerse.',
  Ramo_girasoles:
    'Un ramo que carga la energía del verano. Los girasoles fueron los primeros en aprender que hay que mirar siempre hacia donde hay luz.',
  Rose_amore:
    'Amore — la palabra lo dice todo. Esta rosa no fue diseñada para adornar, sino para confesar lo que el corazón lleva callado demasiado tiempo.',
  Rosso_pasiones:
    'El rojo no susurra, declama. Rosso Pasiones es para los que sienten fuerte y no tienen miedo de que se note.',
  Sylla:
    'Mitológica y etérea, Sylla florece como un poema antiguo: con la fuerza de lo que ha sobrevivido y la gracia de lo que jamás envejece.',
  Tokyo_primavera:
    'Una explosión de flores de cerezo que no pide permiso para ser hermosa. Tokyo en primavera es el recordatorio de que la belleza también es fugaz y por eso vale tanto.',
  Tulipanes:
    'Los tulipanes llegaron de Oriente para conquistar los jardines del mundo. Hoy llegan a ti con toda la promesa de la estación más esperada.',
  Tulipanes_2:
    'Más tulipanes, más primavera. Como si la estación hubiera decidido quedarse un poco más para seguir regalando color.',
  Tulipanes_3:
    'El tercer acto de la primavera. Estos tulipanes cierran el círculo de la estación con la misma gracia con que empezaron.',
  Venezia:
    'Como un canal veneciano al atardecer, Venezia es puro romanticismo flotando sobre el agua — majestuoso, sereno, imposible de olvidar.',
}

const OPEN_HOUR = 10
const CLOSE_HOUR = 19
const SLOT_MINUTES = 30

function startOfDay(dateValue) {
  const d = new Date(dateValue)
  d.setHours(0, 0, 0, 0)
  return d
}

function isSunday(dateValue) {
  return new Date(dateValue).getDay() === 0
}

function formatSlot(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatISODate(dateValue) {
  const year = dateValue.getFullYear()
  const month = String(dateValue.getMonth() + 1).padStart(2, '0')
  const day = String(dateValue.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function resolveEarliestDateTime() {
  const now = new Date()
  const earliest = new Date(now)
  earliest.setDate(earliest.getDate() + 1)
  earliest.setHours(OPEN_HOUR, 0, 0, 0)
  while (isSunday(earliest)) {
    earliest.setDate(earliest.getDate() + 1)
    earliest.setHours(OPEN_HOUR, 0, 0, 0)
  }
  return earliest
}

function buildTimeSlots(selectedDate, earliestDateTime) {
  if (!selectedDate || isSunday(selectedDate)) {
    return []
  }
  const date = startOfDay(selectedDate)
  const isEarliestDay = startOfDay(earliestDateTime).getTime() === date.getTime()
  const earliestMinutes = (earliestDateTime.getHours() * 60) + earliestDateTime.getMinutes()
  const minAllowedMinutes = isEarliestDay
    ? Math.max(OPEN_HOUR * 60, Math.ceil(earliestMinutes / SLOT_MINUTES) * SLOT_MINUTES)
    : OPEN_HOUR * 60
  const endMinutes = CLOSE_HOUR * 60
  const slots = []
  for (let minutes = OPEN_HOUR * 60; minutes <= endMinutes; minutes += SLOT_MINUTES) {
    slots.push({ value: formatSlot(minutes), disabled: minutes < minAllowedMinutes })
  }
  return slots
}

function findNextAvailableDate(baseDate, earliestDateTime) {
  let date = startOfDay(baseDate)
  for (let i = 0; i < 30; i += 1) {
    const hasEnabled = buildTimeSlots(date, earliestDateTime).some((s) => !s.disabled)
    if (!isSunday(date) && hasEnabled) {
      return date
    }
    date = new Date(date)
    date.setDate(date.getDate() + 1)
    date = startOfDay(date)
  }
  return date
}

function hasEnabledSlots(date, earliestDateTime) {
  if (isSunday(date)) return false
  return buildTimeSlots(date, earliestDateTime).some((s) => !s.disabled)
}

const DateTrigger = forwardRef(function DateTrigger({ value, onClick }, ref) {
  return (
    <button
      type="button"
      className="visualizacion__date-trigger"
      onClick={onClick}
      ref={ref}
      aria-label="Elegir fecha de entrega"
    >
      {value || 'Seleccionar fecha'}
    </button>
  )
})

function FloralDeco({ petalColor = '#e87de8', centerColor = '#f0c8ee', innerColor = '#fff0fc' }) {
  return (
    <svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <ellipse
          key={angle}
          cx="70" cy="70" rx="15" ry="36"
          fill={petalColor}
          transform={`rotate(${angle}, 70, 70) translate(0, -22)`}
        />
      ))}
      <circle cx="70" cy="70" r="14" fill={centerColor} />
      <circle cx="70" cy="70" r="7" fill={innerColor} />
    </svg>
  )
}

function Visualización() {
  const {
    selectedFlower,
    clearSelectedFlower,
    addToCart,
    selectedDeliveryDate,
    setSelectedDeliveryDate,
    setSelectedDeliveryTime,
    selectedDeliveryCity,
    setSelectedDeliveryCity
  } = useCart()

  const earliestDeliveryDateTime = useMemo(() => resolveEarliestDateTime(), [])
  const minDeliveryDate = useMemo(
    () => startOfDay(earliestDeliveryDateTime),
    [earliestDeliveryDateTime]
  )

  const [deliveryDate, setDeliveryDate] = useState(() => {
    const earliest = resolveEarliestDateTime()
    const minDate = startOfDay(earliest)
    if (selectedDeliveryDate) {
      const fromCtx = new Date(`${selectedDeliveryDate}T00:00:00`)
      if (fromCtx >= minDate) return findNextAvailableDate(fromCtx, earliest)
    }
    return findNextAvailableDate(minDate, earliest)
  })
  const [deliveryTime, setDeliveryTime] = useState('')
  const [isMobileDatePicker, setIsMobileDatePicker] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth <= 560 : false
  )
  const [currentImageIndex, setCurrentImageIndex] = useState(
    selectedFlower?.principalIndex ?? 0
  )

  const effectiveDeliveryDate = useMemo(() => {
    const candidate = deliveryDate && deliveryDate >= minDeliveryDate
      ? startOfDay(deliveryDate)
      : minDeliveryDate
    return findNextAvailableDate(candidate, earliestDeliveryDateTime)
  }, [deliveryDate, earliestDeliveryDateTime, minDeliveryDate])

  const availableTimeSlots = useMemo(
    () => buildTimeSlots(effectiveDeliveryDate, earliestDeliveryDateTime),
    [effectiveDeliveryDate, earliestDeliveryDateTime]
  )
  const firstEnabledTime = availableTimeSlots.find((s) => !s.disabled)?.value ?? ''
  const selectedTimeIsEnabled = availableTimeSlots.some(
    (s) => s.value === deliveryTime && !s.disabled
  )
  const effectiveDeliveryTime = selectedTimeIsEnabled ? deliveryTime : firstEnabledTime

  useEffect(() => {
    setSelectedDeliveryDate(formatISODate(effectiveDeliveryDate))
    setSelectedDeliveryTime(effectiveDeliveryTime)
  }, [effectiveDeliveryDate, effectiveDeliveryTime, setSelectedDeliveryDate, setSelectedDeliveryTime])

  useEffect(() => {
    const handleResize = () => setIsMobileDatePicker(window.innerWidth <= 560)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (!selectedFlower) {
    return null
  }

  const { name, images, price, stock, preparationHours, hasInventoryRecord, descripcion, id } = selectedFlower
  const poetic = POETIC_DESCRIPTIONS[id] || null
  const displayDescripcion = descripcion && poetic
    ? `${descripcion} ${poetic}`
    : descripcion || poetic || null
  const totalImages = images?.length ?? 0
  const normalizedIndex = totalImages
    ? ((currentImageIndex % totalImages) + totalImages) % totalImages
    : 0
  const currentImage = images?.[normalizedIndex] ?? selectedFlower.image
  const canAddToCart = typeof price === 'number' && typeof stock === 'number' && stock > 0

  return (
    <div className="visualizacion">
      <div className="visualizacion__deco visualizacion__deco--tr" aria-hidden="true"><FloralDeco /></div>
      <div className="visualizacion__deco visualizacion__deco--bl" aria-hidden="true"><FloralDeco /></div>
      <div className="visualizacion__deco visualizacion__deco--tl" aria-hidden="true">
        <FloralDeco petalColor="#e8c000" centerColor="#ffe566" innerColor="#fffbe0" />
      </div>
      <div className="visualizacion__deco visualizacion__deco--br" aria-hidden="true">
        <FloralDeco petalColor="#e8c000" centerColor="#ffe566" innerColor="#fffbe0" />
      </div>

      <button
        type="button"
        className="visualizacion__back"
        onClick={clearSelectedFlower}
      >
        ← Volver al catálogo
      </button>

      <div className="visualizacion__layout">
        <div className="visualizacion__gallery">
          <div className="visualizacion__image-wrap">
            <img
              className="visualizacion__image"
              src={currentImage}
              alt={name}
              decoding="async"
            />
            {totalImages > 1 && (
              <>
                <button
                  type="button"
                  className="visualizacion__nav visualizacion__nav--left"
                  onClick={() => setCurrentImageIndex((i) => i - 1)}
                  aria-label="Imagen anterior"
                >
                  &#8249;
                </button>
                <button
                  type="button"
                  className="visualizacion__nav visualizacion__nav--right"
                  onClick={() => setCurrentImageIndex((i) => i + 1)}
                  aria-label="Imagen siguiente"
                >
                  &#8250;
                </button>
                <span className="visualizacion__counter" aria-hidden="true">
                  {normalizedIndex + 1}/{totalImages}
                </span>
              </>
            )}
          </div>

          {totalImages > 1 && (
            <div className="visualizacion__thumbs">
              {images.map((src, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`visualizacion__thumb ${idx === normalizedIndex ? 'visualizacion__thumb--active' : ''}`}
                  onClick={() => setCurrentImageIndex(idx)}
                  aria-label={`Ver imagen ${idx + 1}`}
                >
                  <img src={src} alt={`${name} ${idx + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="visualizacion__info">
          <h2 className="visualizacion__name">{name}</h2>

          {displayDescripcion && (
            <p className="visualizacion__descripcion">{displayDescripcion}</p>
          )}

          <p className="visualizacion__price">
            {typeof price === 'number' ? `$${price} MXN` : 'Precio no disponible'}
          </p>

          {typeof stock === 'number' && stock <= 0 && (
            <p className="visualizacion__stock visualizacion__stock--out">Agotado</p>
          )}
          {typeof stock === 'number' && stock > 0 && (
            <p className="visualizacion__stock">{stock} disponibles</p>
          )}
          {hasInventoryRecord && typeof preparationHours === 'number' && (
            <p className="visualizacion__prep">
              Tiempo de preparación: {preparationHours < 24
                ? `${preparationHours}h`
                : `${Math.round(preparationHours / 24)} día${preparationHours >= 48 ? 's' : ''}`}
            </p>
          )}

          <div className="visualizacion__floral-divider" aria-hidden="true">
            <svg viewBox="0 0 200 16" xmlns="http://www.w3.org/2000/svg">
              <line x1="0" y1="8" x2="82" y2="8" stroke="#efb7ea" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="90" cy="8" r="3" fill="#f894f4" opacity="0.55" />
              <circle cx="100" cy="8" r="5" fill="#f894f4" opacity="0.8" />
              <circle cx="110" cy="8" r="3" fill="#f894f4" opacity="0.55" />
              <line x1="118" y1="8" x2="200" y2="8" stroke="#efb7ea" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>

          <div className="visualizacion__schedule">
            <div className="visualizacion__schedule-col">
              <span className="visualizacion__schedule-label">Fecha</span>
              <DatePicker
                selected={effectiveDeliveryDate}
                onChange={(date) => setDeliveryDate(date || minDeliveryDate)}
                minDate={minDeliveryDate}
                filterDate={(date) => hasEnabledSlots(date, earliestDeliveryDateTime)}
                locale={es}
                dateFormat="EEE d MMM"
                popperPlacement="bottom-start"
                portalId="root"
                calendarClassName="visualizacion__calendar"
                customInput={<DateTrigger />}
                withPortal={isMobileDatePicker}
              />
            </div>

            <div className="visualizacion__schedule-col">
              <span className="visualizacion__schedule-label">Horario</span>
              <select
                className="visualizacion__schedule-control"
                value={effectiveDeliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                aria-label="Elegir horario de entrega"
              >
                {availableTimeSlots.map((slot) => (
                  <option key={slot.value} value={slot.value} disabled={slot.disabled}>
                    {slot.value}
                  </option>
                ))}
              </select>
            </div>

            <div className="visualizacion__schedule-col">
              <span className="visualizacion__schedule-label">Ciudad</span>
              <select
                className="visualizacion__schedule-control"
                value={selectedDeliveryCity}
                onChange={(e) => setSelectedDeliveryCity(e.target.value)}
                aria-label="Elegir ciudad de entrega"
              >
                {DELIVERY_CITIES.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="visualizacion__spacer" />

      <div className="visualizacion__sticky-bar">
        <button
          type="button"
          className="visualizacion__add-button"
          onClick={() => addToCart(selectedFlower)}
          disabled={!canAddToCart}
        >
          {canAddToCart ? 'Agregar al carrito' : (typeof stock === 'number' && stock <= 0 ? 'Agotado' : 'No disponible')}
        </button>
      </div>
    </div>
  )
}

export default Visualización
