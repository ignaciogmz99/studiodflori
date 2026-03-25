import { useEffect, useState } from 'react'
import './visualización.css'
import { useCart } from '../context/CartContext'
import DeliverySchedulePicker from './DeliverySchedulePicker'

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
  const { selectedFlower, clearSelectedFlower, addToCart } = useCart()
  const [currentImageIndex, setCurrentImageIndex] = useState(
    selectedFlower?.principalIndex ?? 0
  )

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  if (!selectedFlower) return null

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

      <button type="button" className="visualizacion__back" onClick={clearSelectedFlower}>
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

          <DeliverySchedulePicker showCity />
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
