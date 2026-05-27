import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Flores_menu.css'
import { supabase } from '../lib/supabaseClient'
import { useCart } from '../context/CartContext'
import { PROMO_PRODUCT_IDS, PROMO_ORIGINAL_PRICE, PROMO_FILTER_KEY, KIRA_MILAN_COLLECTION_IDS, KIRA_MILAN_FILTER_KEY, KIRA_MILAN_ORIGINAL_PRICES, CATALOGO_2026_IDS, CATALOGO_2026_FILTER_KEY, CATALOGO_2025_IDS, CATALOGO_2025_FILTER_KEY, CATALOGO_2023_IDS, CATALOGO_2023_FILTER_KEY, CATALOGO_2024_IDS, CATALOGO_2024_FILTER_KEY, DIA_MADRES_IDS, DIA_MADRES_FILTER_KEY, DIA_MADRES_ORDER, ENABLE_MOTHERS_DAY_CATALOG } from '../constants/promoProducts'
import { formatMxPrice, HOT_SALE_BADGE_LABEL, resolveProductPriceDisplay } from '../lib/productPricing'

const assetModulesL1 = import.meta.glob('../assets/*/*.webp', { eager: true, import: 'default' })
const assetModulesL2 = import.meta.glob('../assets/*/*/*.webp', { eager: true, import: 'default' })
const assetModules = { ...assetModulesL1, ...assetModulesL2 }

const dmEncabezado = '/dm-encabezado.webp'

const ROMAN_NUMERALS = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
  7: 'VII',
  8: 'VIII',
  9: 'IX',
  10: 'X'
}

export function formatProductName(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const parsed = Number(part)
      if (Number.isInteger(parsed) && ROMAN_NUMERALS[parsed]) {
        return ROMAN_NUMERALS[parsed]
      }

      return part
    })
    .join(' ')
}

const shelfProducts = Object.entries(assetModules).reduce((acc, [path, src]) => {
  const normalized = path.replaceAll('\\', '/')
  const match = normalized.match(/([^/]+)\/([^/]+)$/)

  if (!match) {
    return acc
  }

  const folder = match[1]
  const file = match[2]

  if (!acc[folder]) {
    acc[folder] = []
  }

  acc[folder].push({ src, file })

  return acc
}, {})

export const localProducts = Object.entries(shelfProducts)
  .map(([name, images]) => {
    const sortedImages = images.sort((a, b) => a.file.localeCompare(b.file))
    const principalIndex = sortedImages.findIndex((image) => /^flor1\./i.test(image.file))

    return {
      id: name,
      name: formatProductName(name),
      images: sortedImages.map((image) => image.src),
      principalIndex: principalIndex >= 0 ? principalIndex : 0
    }
  })
  .filter((item) => item.images.length > 0)
  .sort((a, b) => a.name.localeCompare(b.name))

const OPEN_HOUR = 10
const CLOSE_HOUR = 19
const ALL_FLOWER_TYPES = 'all'

export function normalizeFlowerType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export function formatFlowerTypeLabel(value) {
  const normalized = normalizeFlowerType(value)

  if (!normalized) {
    return ''
  }

  if (normalized === ALL_FLOWER_TYPES) {
    return 'Ver todo'
  }

  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function resolvePreparationHours(inventory) {
  if (!inventory) {
    return 24
  }

  const directHours = Number(
    inventory.tiempo_preparacion_horas
    ?? inventory.preparacion_horas
    ?? inventory.preparation_hours
  )

  if (Number.isFinite(directHours) && directHours > 0) {
    return directHours
  }

  const days = Number(
    inventory.tiempo_preparacion_dias
    ?? inventory.preparacion_dias
    ?? inventory.preparation_days
  )

  if (Number.isFinite(days) && days > 0) {
    return days * 24
  }

  return 24
}

export function getPreparationLabel(hours) {
  const parsedHours = Number(hours)
  const preparationHours = Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : 24
  const now = new Date()
  const nextAvailableDate = new Date(now)
  nextAvailableDate.setDate(nextAvailableDate.getDate() + 1)

  if (preparationHours < 24) {
    const currentHour = now.getHours()
    const isWithinDeliveryWindow = currentHour >= OPEN_HOUR && currentHour < CLOSE_HOUR
    const earliestReadyAt = new Date(now.getTime() + (preparationHours * 60 * 60 * 1000))
    const cutoffToday = new Date(now)
    cutoffToday.setHours(CLOSE_HOUR, 0, 0, 0)
    const isSameDay = earliestReadyAt.toDateString() === now.toDateString()

    if (isWithinDeliveryWindow && isSameDay && earliestReadyAt <= cutoffToday) {
      return 'Hoy sale'
    }
  }

  if (nextAvailableDate.getDay() === 0) {
    return 'Lunes a primera hora'
  }

  return 'Mañana a primera hora'
}

function FloresMenu() {
  const [inventoryById, setInventoryById] = useState({})
  const [inventoryStatus, setInventoryStatus] = useState(supabase ? 'loading' : 'unavailable')
  const [retryCount, setRetryCount] = useState(0)
  const [imageIndexByProduct, setImageIndexByProduct] = useState({})
  const [isPriceFilterOpen, setIsPriceFilterOpen] = useState(false)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [nameSearchOpen, setNameSearchOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(10)
  const priceFiltersRef = useRef(null)
  const nameSearchRef = useRef(null)
  const loadMoreRef = useRef(null)
  const {
    addToCart,
    setSelectedFlower,
    selectedFlowerType,
    isMothersDayCatalogLocked,
    setFlowerTypeTabs
  } = useCart()
  const navigate = useNavigate()

  const openProduct = (product) => {
    setSelectedFlower(product)
    navigate('/flores/' + product.id)
  }

  useEffect(() => {
    let isMounted = true

    async function loadInventory() {
      if (!supabase) {
        setInventoryStatus('unavailable')
        return
      }

      setInventoryStatus('loading')
      const { data, error } = await supabase
        .from('productos')
        .select('*')

      if (error) {
        console.error('Error cargando inventario desde Supabase:', error.message)
        if (isMounted) {
          setInventoryStatus('error')
        }
        return
      }

      if (!isMounted) {
        return
      }

      const nextInventory = (data || []).reduce((acc, item) => {
        if (item.activo === false) {
          return acc
        }

        acc[item.id] = item
        return acc
      }, {})

      setInventoryById(nextInventory)
      setInventoryStatus('ready')
    }

    loadInventory()

    return () => {
      isMounted = false
    }
  }, [retryCount])

  useEffect(() => {
    if (!isPriceFilterOpen) {
      return undefined
    }

    const handleOutsideClick = (event) => {
      if (!priceFiltersRef.current) {
        return
      }

      if (!priceFiltersRef.current.contains(event.target)) {
        setIsPriceFilterOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isPriceFilterOpen])

  useEffect(() => {
    if (!nameSearchOpen) return undefined
    const handleOutside = (event) => {
      if (nameSearchRef.current && !nameSearchRef.current.contains(event.target)) {
        setNameSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [nameSearchOpen])

  const products = useMemo(() => {
    return localProducts.map((product) => {
      const inventory = inventoryById[product.id]
      const parsedPrice = inventory?.precio == null ? null : Number(inventory.precio)
      const parsedOriginalPrice = inventory?.precio_original == null
        ? Number(inventory?.precioOriginal)
        : Number(inventory.precio_original)
      const currentIndex = imageIndexByProduct[product.id] ?? product.principalIndex
      const normalizedIndex = product.images.length ? ((currentIndex % product.images.length) + product.images.length) % product.images.length : 0

      return {
        ...product,
        image: product.images[normalizedIndex],
        currentImageNumber: normalizedIndex + 1,
        totalImages: product.images.length,
        flowerType: normalizeFlowerType(
          inventory?.tipo_flor
          ?? inventory?.tipoFlor
        ),
        price: Number.isNaN(parsedPrice) ? null : parsedPrice,
        originalPrice: Number.isNaN(parsedOriginalPrice) ? null : parsedOriginalPrice,
        stock: inventory?.stock ?? null,
        preparationHours: resolvePreparationHours(inventory),
        hasInventoryRecord: Boolean(inventory),
        descripcion: inventory?.descripcion ?? inventory?.descripción ?? null
      }
      }).filter((product) => ENABLE_MOTHERS_DAY_CATALOG || !DIA_MADRES_IDS.has(product.id))
    }, [inventoryById, imageIndexByProduct])

  const nameSuggestions = useMemo(() => {
    const q = nameSearch.trim().toLowerCase()
    if (!q) return []
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8)
  }, [nameSearch, products])

  const flowerTypeTabs = useMemo(() => {
    const seen = new Set()
    const tabs = [{ value: ALL_FLOWER_TYPES, label: 'Ver todo' }]

    products.forEach((product) => {
      if (!product.flowerType || seen.has(product.flowerType)) {
        return
      }

      seen.add(product.flowerType)
      tabs.push({
        value: product.flowerType,
        label: formatFlowerTypeLabel(product.flowerType)
      })
    })

    return tabs
  }, [products])

  useEffect(() => {
    setFlowerTypeTabs(flowerTypeTabs)
  }, [flowerTypeTabs, setFlowerTypeTabs])

  const activeFlowerType = useMemo(() => {
    if (ENABLE_MOTHERS_DAY_CATALOG && isMothersDayCatalogLocked) return DIA_MADRES_FILTER_KEY
    if (selectedFlowerType === ALL_FLOWER_TYPES) return ALL_FLOWER_TYPES
    if (selectedFlowerType === PROMO_FILTER_KEY) return PROMO_FILTER_KEY
    if (selectedFlowerType === KIRA_MILAN_FILTER_KEY) return KIRA_MILAN_FILTER_KEY
    if (ENABLE_MOTHERS_DAY_CATALOG && selectedFlowerType === DIA_MADRES_FILTER_KEY) return DIA_MADRES_FILTER_KEY
    if (selectedFlowerType === CATALOGO_2026_FILTER_KEY) return CATALOGO_2026_FILTER_KEY
    if (selectedFlowerType === CATALOGO_2025_FILTER_KEY) return CATALOGO_2025_FILTER_KEY
    if (selectedFlowerType === CATALOGO_2023_FILTER_KEY) return CATALOGO_2023_FILTER_KEY
    if (selectedFlowerType === CATALOGO_2024_FILTER_KEY) return CATALOGO_2024_FILTER_KEY
    const typeStillExists = flowerTypeTabs.some((tab) => tab.value === selectedFlowerType)
    return typeStillExists ? selectedFlowerType : ALL_FLOWER_TYPES
  }, [flowerTypeTabs, isMothersDayCatalogLocked, selectedFlowerType])

  const filteredProducts = useMemo(() => {
    const productsByFlowerType = products.filter((product) => {
      if (activeFlowerType === PROMO_FILTER_KEY) return PROMO_PRODUCT_IDS.has(product.id)
      if (activeFlowerType === KIRA_MILAN_FILTER_KEY) return KIRA_MILAN_COLLECTION_IDS.has(product.id)
      if (ENABLE_MOTHERS_DAY_CATALOG && activeFlowerType === DIA_MADRES_FILTER_KEY) {
        return DIA_MADRES_IDS.has(product.id)
      }
      if (activeFlowerType === CATALOGO_2026_FILTER_KEY) return CATALOGO_2026_IDS.has(product.id)
      if (activeFlowerType === CATALOGO_2025_FILTER_KEY) return CATALOGO_2025_IDS.has(product.id)
      if (activeFlowerType === CATALOGO_2023_FILTER_KEY) return CATALOGO_2023_IDS.has(product.id)
      if (activeFlowerType === CATALOGO_2024_FILTER_KEY) return CATALOGO_2024_IDS.has(product.id)
      if (activeFlowerType !== ALL_FLOWER_TYPES && product.flowerType !== activeFlowerType) return false
      return true
    })

    const parsedMinPrice = minPrice === '' ? null : Number(minPrice)
    const parsedMaxPrice = maxPrice === '' ? null : Number(maxPrice)
    const hasMinPrice = parsedMinPrice != null && !Number.isNaN(parsedMinPrice)
    const hasMaxPrice = parsedMaxPrice != null && !Number.isNaN(parsedMaxPrice)
    const lowerBound = hasMinPrice && hasMaxPrice ? Math.min(parsedMinPrice, parsedMaxPrice) : parsedMinPrice
    const upperBound = hasMinPrice && hasMaxPrice ? Math.max(parsedMinPrice, parsedMaxPrice) : parsedMaxPrice

    const result = productsByFlowerType.filter((product) => {
      if (lowerBound != null) {
        if (typeof product.price !== 'number' || product.price < lowerBound) {
          return false
        }
      }

      if (upperBound != null) {
        if (typeof product.price !== 'number' || product.price > upperBound) {
          return false
        }
      }

      if (nameSearch.trim()) {
        const q = nameSearch.trim().toLowerCase()
        if (!product.name.toLowerCase().includes(q)) return false
      }

      return true
    })

    return result.sort((a, b) => {
      if (!ENABLE_MOTHERS_DAY_CATALOG || activeFlowerType !== DIA_MADRES_FILTER_KEY) {
        return 0
      }

      const aOrder = DIA_MADRES_ORDER[a.id] ?? null
      const bOrder = DIA_MADRES_ORDER[b.id] ?? null
      if (aOrder !== null && bOrder !== null) return aOrder - bOrder
      return 0
    })
  }, [activeFlowerType, maxPrice, minPrice, nameSearch, products])

  useEffect(() => {
    filteredProducts.forEach((product) => {
      if (!product.images || product.images.length < 2) {
        return
      }

      const currentIndex = imageIndexByProduct[product.id] ?? product.principalIndex
      const normalizedIndex = ((currentIndex % product.images.length) + product.images.length) % product.images.length
      const preloadTargets = [
        product.images[(normalizedIndex + 1) % product.images.length],
        product.images[(normalizedIndex - 1 + product.images.length) % product.images.length]
      ]

      preloadTargets.forEach((src) => {
        if (!src) {
          return
        }

        const image = new window.Image()
        image.decoding = 'async'
        image.src = src
      })
    })
  }, [filteredProducts, imageIndexByProduct])

  const showPreviousImage = (product) => {
    setImageIndexByProduct((prev) => {
      const current = prev[product.id] ?? product.principalIndex
      return {
        ...prev,
        [product.id]: current - 1
      }
    })
  }

  const showNextImage = (product) => {
    setImageIndexByProduct((prev) => {
      const current = prev[product.id] ?? product.principalIndex
      return {
        ...prev,
        [product.id]: current + 1
      }
    })
  }

  useEffect(() => {
    setVisibleCount(10)
  }, [nameSearch, minPrice, maxPrice, activeFlowerType])

  useEffect(() => {
    const sentinel = loadMoreRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((c) => c + 10)
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  const selectedFlowerTypeLabel = formatFlowerTypeLabel(activeFlowerType)
  const headline = activeFlowerType === ALL_FLOWER_TYPES
    ? 'Flores a domicilio en Guadalajara con entrega para cada ocasion'
    : `${selectedFlowerTypeLabel} a domicilio en Guadalajara con entrega`

  return (
    <section className="flores-menu" id="catalogo-flores" aria-label="Catalogo de flores y plantas">
      <h3 className="flores-menu__headline">{headline}</h3>

      <div className="flores-menu__actions">
        <div className="flores-menu__filters-group-wrap">
        <div className="flores-menu__filters-dropdown" ref={priceFiltersRef}>
          <button
            type="button"
            className="flores-menu__filter"
            onClick={() => setIsPriceFilterOpen((prev) => !prev)}
            aria-expanded={isPriceFilterOpen}
            aria-controls="flores-menu-price-filters"
          >
            Filtrar por precio
          </button>
          {isPriceFilterOpen && (
            <div className="flores-menu__filters-panel" id="flores-menu-price-filters">
              <div className="flores-menu__filters-group">
                <label className="flores-menu__filters-label" htmlFor="min-price">
                  Precio minimo
                </label>
                <input
                  id="min-price"
                  className="flores-menu__filters-input"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Ej: 500"
                  value={minPrice}
                  onChange={(event) => setMinPrice(event.target.value)}
                />
              </div>

              <div className="flores-menu__filters-group">
                <label className="flores-menu__filters-label" htmlFor="max-price">
                  Precio maximo
                </label>
                <input
                  id="max-price"
                  className="flores-menu__filters-input"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Ej: 2000"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                />
              </div>
            </div>
          )}
          </div>
          <div className="flores-menu__name-search" ref={nameSearchRef}>
          <div className="flores-menu__name-search-control">
            <input
              className="flores-menu__name-search-input"
              type="text"
              placeholder="Buscar por nombre..."
              value={nameSearch}
              onChange={(e) => { setNameSearch(e.target.value); setNameSearchOpen(true) }}
              onFocus={() => setNameSearchOpen(true)}
              aria-label="Buscar flor por nombre"
            />
            {nameSearch && (
              <button
                type="button"
                className="flores-menu__name-search-clear"
                onClick={() => { setNameSearch(''); setNameSearchOpen(false) }}
                aria-label="Limpiar búsqueda"
              >✕</button>
            )}
          </div>
          {nameSearchOpen && nameSuggestions.length > 0 && (
            <ul className="flores-menu__name-search-list">
              {nameSuggestions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flores-menu__name-search-option"
                    onClick={() => { setNameSearch(p.name); setNameSearchOpen(false) }}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          </div>
        </div>

        <span className="flores-menu__count">{filteredProducts.length} productos</span>
      </div>

      {inventoryStatus === 'unavailable' && (
        <p className="flores-menu__stock">
          No se pudo conectar al inventario. Verifica las variables de Supabase para habilitar precios y compra.
        </p>
      )}
      {inventoryStatus === 'error' && (
        <p className="flores-menu__stock">
          Hubo un error cargando el inventario.{' '}
          <button onClick={() => setRetryCount((c) => c + 1)} style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
            Intentar de nuevo
          </button>
        </p>
      )}

      {ENABLE_MOTHERS_DAY_CATALOG && activeFlowerType === DIA_MADRES_FILTER_KEY && dmEncabezado && (
        <img
          src={dmEncabezado}
          alt="Catálogo Día de las Madres — Studio dei Fiori"
          className="flores-menu__dm-banner"
        />
      )}

      <div className="flores-menu__shelf" aria-label="Estante de productos">
        {filteredProducts.slice(0, visibleCount).map((product) => {
          const fallbackOriginalPrice = PROMO_PRODUCT_IDS.has(product.id)
            ? PROMO_ORIGINAL_PRICE
            : KIRA_MILAN_ORIGINAL_PRICES[product.id] ?? null
          const priceDisplay = resolveProductPriceDisplay(product.id, product.price, fallbackOriginalPrice, product.originalPrice)

          return (
            <article className="flores-menu__card" key={product.id}>
            <div
              className={`flores-menu__image-wrap flores-menu__image-wrap--clickable${DIA_MADRES_IDS.has(product.id) ? ' flores-menu__image-wrap--landscape' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Ver detalle de ${product.name}`}
              onClick={() => openProduct(product)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openProduct(product) }}
            >
              <img
                className={`flores-menu__image${DIA_MADRES_IDS.has(product.id) ? ' flores-menu__image--contain' : ''}`}
                src={product.image}
                alt={product.name}
                loading="lazy"
                decoding="async"
              />
              {PROMO_PRODUCT_IDS.has(product.id) && (
                <span className="flores-menu__promo-badge" aria-label="Promoción">Promoción</span>
              )}
              {KIRA_MILAN_COLLECTION_IDS.has(product.id) && (
                <span className="flores-menu__collection-badge" aria-label="Kira Milan Collection">✨ Collection</span>
              )}
              {priceDisplay.hasHotSale && (
                <span className="flores-menu__hot-sale-badge" aria-label={HOT_SALE_BADGE_LABEL}>{HOT_SALE_BADGE_LABEL}</span>
              )}
              {product.totalImages > 1 && (
                <>
                  <button
                    type="button"
                    className="flores-menu__image-nav flores-menu__image-nav--left"
                    onClick={(e) => { e.stopPropagation(); showPreviousImage(product) }}
                    aria-label={`Ver imagen anterior de ${product.name}`}
                  >
                    &#8249;
                  </button>
                  <button
                    type="button"
                    className="flores-menu__image-nav flores-menu__image-nav--right"
                    onClick={(e) => { e.stopPropagation(); showNextImage(product) }}
                    aria-label={`Ver imagen siguiente de ${product.name}`}
                  >
                    &#8250;
                  </button>
                  <span className="flores-menu__image-counter" aria-hidden="true">
                    {product.currentImageNumber}/{product.totalImages}
                  </span>
                </>
              )}
            </div>
            <p className="flores-menu__name flores-menu__name--clickable" onClick={() => openProduct(product)}>{product.name}</p>
            <p className="flores-menu__price flores-menu__price--clickable" onClick={() => openProduct(product)}>
              {inventoryStatus === 'loading'
                ? 'Cargando precio...'
                : priceDisplay.currentPrice !== null
                  ? (
                    <>
                      {priceDisplay.originalPrice !== null && (
                        <s className="flores-menu__price-original">${formatMxPrice(priceDisplay.originalPrice)} MXN</s>
                      )}
                      <span className={`flores-menu__price-current${priceDisplay.hasHotSale ? ' flores-menu__price-current--sale' : ''}`}>
                        ${formatMxPrice(priceDisplay.currentPrice)} MXN
                      </span>
                    </>
                  )
                  : 'Precio no disponible'}
            </p>
            {inventoryStatus === 'loading' && (
              <p className="flores-menu__stock">Cargando stock...</p>
            )}
            {inventoryStatus !== 'loading' && typeof product.stock !== 'number' && (
              <p className="flores-menu__stock">Stock no disponible</p>
            )}
            {inventoryStatus !== 'loading' && typeof product.stock === 'number' && product.stock <= 0 && (
              <p className="flores-menu__stock">Agotado</p>
            )}
            {inventoryStatus !== 'loading' && product.hasInventoryRecord && (
              <p className="flores-menu__stock">{getPreparationLabel(product.preparationHours)}</p>
            )}
            <button
              type="button"
              className={`flores-menu__add-button${DIA_MADRES_IDS.has(product.id) ? ' flores-menu__add-button--dm' : ''}`}
              onClick={() => addToCart(product)}
              disabled={
                inventoryStatus === 'loading'
                || typeof product.price !== 'number'
                || typeof product.stock !== 'number'
                || product.stock <= 0
              }
            >
              {inventoryStatus === 'loading' ? 'Cargando...' : 'Agregar al carrito'}
            </button>
            </article>
          )
        })}
      </div>
      <div ref={loadMoreRef} />
    </section>
  )
}

export default FloresMenu
