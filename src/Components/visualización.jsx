import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import './visualización.css'
import { useCart } from '../context/CartContext'
import DeliverySchedulePicker from './DeliverySchedulePicker'
import { PROMO_PRODUCT_IDS, PROMO_ORIGINAL_PRICE, KIRA_MILAN_COLLECTION_IDS, KIRA_MILAN_ORIGINAL_PRICES } from '../constants/promoProducts'

const SITE_URL = 'https://www.studiodeifiori.com'

const POETIC_DESCRIPTIONS = {
  Arreglo_Lilis:
    'Las lilies llevan en su nombre la promesa de lo puro. Erguidas y perfumadas, iluminan cualquier espacio con la gracia de quien no necesita esforzarse para ser hermoso.',
  Ceramica_Floral:
    'Cuando la cerámica abraza las flores, nace algo que perdura más allá de la temporada. La tierra cocida sostiene la vida floreciente — una pieza que es regalo y obra de arte a la vez.',
  Ramo_Margaritas:
    'Las margaritas siempre supieron lo que tardamos en aprender: que la alegría más genuina viene en blanco y amarillo, sin complicaciones, sin pretensiones.',
  Ramo_rosas_Inglesas:
    'Las rosas inglesas son la poesía en flor. Con sus pétalos que se enredan en espiral infinita, guardan en cada capa un verso de belleza que nunca termina de escribirse.',
  Amalfi:
    'Como el perfume del mar en una tarde de verano, el Amalfi lleva en sus pétalos el espíritu de la costa italiana — luminoso, cálido y lleno de vida.',
  Bouquet:
    'Un abrazo hecho flores. Cada tallo escogido a mano para decir lo que las palabras no siempre alcanzan.',
  Bouquet_2:
    'El segundo encuentro siempre es más profundo. Este bouquet regresa con más confianza, más color y la certeza de que lo hermoso merece repetirse.',
  Bouquet_Fiusha:
    'Intenso, audaz, imposible de ignorar. El fucsia no pide permiso para entrar a una habitación — irrumpe con la energía de quien sabe exactamente cuánto vale.',
  Bouquet_Fiusha_2:
    'La segunda vez que el fucsia habla, lo hace con más calma y con más fuerza. Un bouquet que ya no necesita convencer — solo aparecer.',
  Bouquet_Margarita:
    'La margarita siempre ha sabido algo que otras flores tardan en aprender: que la sencillez bien llevada es la forma más pura de la belleza.',
  Bouquet_mini:
    'Grande no es sinónimo de poderoso. Este mini bouquet lo demuestra con cada pétalo: lo mejor a veces llega en el tamaño exacto para caber en el corazón.',
  Bouquet_Pastel_2:
    'El segundo capítulo de una historia que se niega a terminar. Tonos suaves que evolucionan, como un amanecer que tarda en llegar pero vale cada minuto de espera.',
  Bouquet_salmon:
    'Entre el rosa y el naranja vive el salmón — ese tono cálido que recuerda al atardecer sobre el mar. Un bouquet que se siente como el final perfecto de un buen día.',
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
  Vita_verde:
    'Verde como la promesa que hace la tierra cada primavera. Este arreglo respira vida con cada hoja y cada pétalo — fresco, sereno y lleno de la energía silenciosa de la naturaleza.',
  Venezia:
    'Como un canal veneciano al atardecer, Venezia es puro romanticismo flotando sobre el agua — majestuoso, sereno, imposible de olvidar.',
  Milan_2:
    'Milán siempre vuelve con algo nuevo que decir. Esta segunda edición guarda la sofisticación de la ciudad de la moda en cada pétalo — refinado, moderno y sin esfuerzo.',
  Rotterdam:
    'Arquitectura en flor. Rotterdam combina la audacia de lo contemporáneo con la suavidad de la naturaleza, como un puente entre lo que el mundo construye y lo que la tierra hace crecer.',
  Cerezo:
    'Los cerezos florecen una sola vez al año y por eso su belleza duele un poco. Este ramo captura ese instante fugaz — delicado, rosado y lleno de la emoción de lo que no puede quedarse para siempre.',
  Verona:
    'En Verona nació la historia de amor más famosa del mundo. Este arreglo lleva ese mismo peso — el de los sentimientos que no caben en palabras y que solo las flores saben cargar.',
  Milan:
    'Milán huele a diseño, a café temprano y a perfume caro. Este arreglo tiene esa misma energía: elegante sin esfuerzo, moderno sin prisa, bello sin pedir permiso.',
  Versalles:
    'Los jardines de Versalles fueron diseñados para impresionar a reyes. Este arreglo guarda ese mismo espíritu — generoso, grandioso y construido para quien merece lo mejor.',
  York:
    'Con la serenidad de las colinas inglesas y el carácter de sus piedras antiguas, York florece con una belleza discreta que no necesita adornos para quedarse en la memoria.',
  Bari:
    'Bari mira al mar Adriático con los ojos abiertos. Este arreglo tiene esa misma luz del sur de Italia — cálida, directa y llena de la energía de quien vive cerca del agua.',
  Ramo_lisianthus:
    'El lisianthus es la flor que parece una rosa pero no lo es — y esa diferencia lo hace extraordinario. Con sus pétalos en capas suaves guarda la ternura de lo que no necesita ser otra cosa para ser hermoso.',
  Caja_floral_tulipanes:
    'Una caja llena de primavera. Los tulipanes aprendieron hace siglos que la mejor forma de llegar a alguien es juntos — coloridos, generosos y sin disculpas.',
  Niza:
    'Como un paseo por la Promenade des Anglais al atardecer, Niza es luminosa, suave y cargada de esa alegría mediterránea que parece no tener fin.',
  Ceramica_floral_2:
    'La cerámica vuelve a abrazar flores — esta vez con una nueva historia que contar. La tierra y los pétalos encontraron otra forma de decirse que se necesitan.',
  Arreglo_Ezio:
    'Ezio lleva el nombre de un guerrero y la delicadeza de un poeta. Lisianthus bicolor, gerberas y limonium conviven aquí con la armonia de quienes siempre supieron que eran complementos perfectos.',
  Manarola:
    'Manarola se aferra a su roca sobre el mar Ligure con la misma terquedad con que las hortensias se niegan a pasar desapercibidas. Un arreglo que sabe exactamente dónde quiere estar.',
  Tourneso:
    'El girasol nunca ha necesitado que le expliquen qué es la alegría — la vive. Tourneso es ese ramo que llega a una habitación y hace que todo parezca más sencillo y más luminoso.',
  Jardin_floral:
    'Un jardín que cabe en las manos. Flores que se eligieron entre sí para convivir, como vecinos que llevan años compartiendo la misma barda y se quieren sin decirlo.',
  Bouquet_Rosas_3:
    'Cincuenta rosas son cincuenta razones. Este bouquet no deja espacio para la duda — es la declaración más clara y más perfumada que existe.',
  Pink_Love:
    'El amor en rosa ruso. Roxana, clavel y lisianthus se entrelazan en un bouquet que sabe exactamente cómo decir lo que el corazón lleva tiempo queriendo confesar.',
  Sunrise:
    'Matiola, rosas y gerberas se despiertan juntas en este ramo que lleva el nombre del amanecer. Porque hay días que empiezan tan bien que merecen ser recordados.',
  Longiflorum:
    'Las lilies longiflorum son las que no caben en un susurro. Rosas, claveles y hortensias las acompañan aquí como quienes saben que estar cerca de algo extraordinario te hace mejor.',
  Lilium:
    'Simple y elegante, como todas las grandes cosas. El lilium no necesita competir — solo aparecer para recordarle a la habitación quién manda.',
  Alabaster_Garden:
    'Un jardín de alabastro: blanco, generoso, construido para reyes. Este arreglo en caja floral no pide permiso para ser el más imponente de la sala.',
  Admiral:
    'Hortensias, rosas y lisianthus navegan juntas bajo el mando de esta composición que tiene la autoridad serena de quien ha visto muchos mares y nunca ha perdido el rumbo.',
  Docena_gerberas:
    'Doce gerberas amarillas con margarita blanca y limonium — doce razones para sonreír sin necesitar una excusa. Simples, directas y completamente irresistibles.',
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
  const navigate = useNavigate()
  const [currentImageIndex, setCurrentImageIndex] = useState(
    selectedFlower?.principalIndex ?? 0
  )

  useEffect(() => {
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

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
  const metaDescription = displayDescripcion
    ? displayDescripcion.slice(0, 155)
    : `${name} — arreglo floral con entrega a domicilio en Guadalajara.`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description: metaDescription,
    image: currentImage,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'MXN',
      price: typeof price === 'number' ? price : undefined,
      availability: typeof stock === 'number' && stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'Studio dei Fiori' }
    }
  }

  return (
    <>
    <Helmet>
      <title>{name} — Studio dei Fiori | Flores a domicilio Guadalajara</title>
      <meta name="description" content={metaDescription} />
      <link rel="canonical" href={`${SITE_URL}/flores/${id}`} />
      <meta property="og:title" content={`${name} — Studio dei Fiori`} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:url" content={`${SITE_URL}/flores/${id}`} />
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
    <div className="visualizacion">
      <div className="visualizacion__deco visualizacion__deco--tr" aria-hidden="true"><FloralDeco /></div>
      <div className="visualizacion__deco visualizacion__deco--bl" aria-hidden="true"><FloralDeco /></div>
      <div className="visualizacion__deco visualizacion__deco--tl" aria-hidden="true">
        <FloralDeco petalColor="#e8c000" centerColor="#ffe566" innerColor="#fffbe0" />
      </div>
      <div className="visualizacion__deco visualizacion__deco--br" aria-hidden="true">
        <FloralDeco petalColor="#e8c000" centerColor="#ffe566" innerColor="#fffbe0" />
      </div>

      <button type="button" className="visualizacion__back" onClick={() => { clearSelectedFlower(); navigate('/') }}>
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
            {typeof price === 'number' ? (
              <>
                <span>${price} MXN</span>
                {PROMO_PRODUCT_IDS.has(id) && (
                  <s className="visualizacion__price-original">${PROMO_ORIGINAL_PRICE} MXN</s>
                )}
                {KIRA_MILAN_COLLECTION_IDS.has(id) && KIRA_MILAN_ORIGINAL_PRICES[id] && (
                  <s className="visualizacion__price-original">${KIRA_MILAN_ORIGINAL_PRICES[id]} MXN</s>
                )}
              </>
            ) : 'Precio no disponible'}
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
    </>
  )
}

export default Visualización
