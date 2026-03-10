import { useEffect, useMemo, useRef, useState } from 'react'
import './Flores_menu.css'
import { supabase } from '../lib/supabaseClient'
import { useCart } from '../context/CartContext'

const assetModules = import.meta.glob('../assets/*/*.webp', {
  eager: true,
  import: 'default'
})

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

function formatProductName(value) {
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
  const normalized = path.replace('\\', '/')
  const match = normalized.match(/\.\.\/assets\/([^/]+)\/([^/]+)$/)

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

const localProducts = Object.entries(shelfProducts)
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

function normalizeFlowerType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function formatFlowerTypeLabel(value) {
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

function resolvePreparationHours(inventory) {
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

function getDeliveryLabel(hours) {
  const parsedHours = Number(hours)
  const preparationHours = Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : 24

  if (preparationHours >= 24) {
    return 'Preparacion: 24 horas'
  }

  const now = new Date()
  const currentHour = now.getHours()
  const isWithinDeliveryWindow = currentHour >= OPEN_HOUR && currentHour < CLOSE_HOUR
  const earliestReadyAt = new Date(now.getTime() + (preparationHours * 60 * 60 * 1000))
  const cutoffToday = new Date(now)
  cutoffToday.setHours(CLOSE_HOUR, 0, 0, 0)
  const isSameDay = earliestReadyAt.toDateString() === now.toDateString()

  if (isWithinDeliveryWindow && isSameDay && earliestReadyAt <= cutoffToday) {
    return 'Hoy sale'
  }

  return 'Mañana'
}

function getPreparationLabel(hours) {
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
  const [imageIndexByProduct, setImageIndexByProduct] = useState({})
  const [selectedFlowerType, setSelectedFlowerType] = useState(ALL_FLOWER_TYPES)
  const [isPriceFilterOpen, setIsPriceFilterOpen] = useState(false)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const priceFiltersRef = useRef(null)
  const { addToCart } = useCart()

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
  }, [])

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

  const products = useMemo(() => {
    return localProducts.map((product) => {
      const inventory = inventoryById[product.id]
      const parsedPrice = inventory?.precio == null ? null : Number(inventory.precio)
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
        stock: inventory?.stock ?? null,
        preparationHours: resolvePreparationHours(inventory),
        hasInventoryRecord: Boolean(inventory)
      }
    })
  }, [inventoryById, imageIndexByProduct])

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

  const filteredProducts = useMemo(() => {
    const productsByFlowerType = products.filter((product) => {
      if (selectedFlowerType !== ALL_FLOWER_TYPES && product.flowerType !== selectedFlowerType) {
        return false
      }

      return true
    })

    const parsedMinPrice = minPrice === '' ? null : Number(minPrice)
    const parsedMaxPrice = maxPrice === '' ? null : Number(maxPrice)
    const hasMinPrice = parsedMinPrice != null && !Number.isNaN(parsedMinPrice)
    const hasMaxPrice = parsedMaxPrice != null && !Number.isNaN(parsedMaxPrice)
    const lowerBound = hasMinPrice && hasMaxPrice ? Math.min(parsedMinPrice, parsedMaxPrice) : parsedMinPrice
    const upperBound = hasMinPrice && hasMaxPrice ? Math.max(parsedMinPrice, parsedMaxPrice) : parsedMaxPrice

    return productsByFlowerType.filter((product) => {
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

      return true
    })
  }, [maxPrice, minPrice, products, selectedFlowerType])

  useEffect(() => {
    if (selectedFlowerType === ALL_FLOWER_TYPES) {
      return
    }

    const typeStillExists = flowerTypeTabs.some((tab) => tab.value === selectedFlowerType)
    if (!typeStillExists) {
      setSelectedFlowerType(ALL_FLOWER_TYPES)
    }
  }, [flowerTypeTabs, selectedFlowerType])

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

  const selectedFlowerTypeLabel = formatFlowerTypeLabel(selectedFlowerType)
  const headline = selectedFlowerType === ALL_FLOWER_TYPES
    ? 'Flores a domicilio en Guadalajara con entrega rapida para cada ocasion'
    : `${selectedFlowerTypeLabel} a domicilio en Guadalajara con entrega rapida`

  return (
    <section className="flores-menu" aria-label="Catalogo de flores y plantas">
      <div className="flores-menu__tabs-box">
        <h2 className="flores-menu__tabs-title">Flores y Plantas</h2>
        <div className="flores-menu__tabs" role="tablist" aria-label="Categorias de flores">
          {flowerTypeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`flores-menu__tab ${selectedFlowerType === tab.value ? 'flores-menu__tab--active' : ''}`}
              onClick={() => setSelectedFlowerType(tab.value)}
              aria-pressed={selectedFlowerType === tab.value}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <h3 className="flores-menu__headline">{headline}</h3>

      <div className="flores-menu__actions">
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
        <span className="flores-menu__count">{filteredProducts.length} productos</span>
      </div>

      <div className="flores-menu__shelf" aria-label="Estante de productos">
        {filteredProducts.map((product) => (
          <article className="flores-menu__card" key={product.id}>
            <div className="flores-menu__image-wrap">
              <img
                className="flores-menu__image"
                src={product.image}
                alt={product.name}
                loading="lazy"
                decoding="async"
              />
              {product.totalImages > 1 && (
                <>
                  <button
                    type="button"
                    className="flores-menu__image-nav flores-menu__image-nav--left"
                    onClick={() => showPreviousImage(product)}
                    aria-label={`Ver imagen anterior de ${product.name}`}
                  >
                    &#8249;
                  </button>
                  <button
                    type="button"
                    className="flores-menu__image-nav flores-menu__image-nav--right"
                    onClick={() => showNextImage(product)}
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
            <p className="flores-menu__name">{product.name}</p>
            <p className="flores-menu__price">
              {inventoryStatus === 'loading'
                ? 'Cargando precio...'
                : typeof product.price === 'number'
                  ? `$${product.price} MXN`
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
              className="flores-menu__add-button"
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
        ))}
      </div>
    </section>
  )
}

export default FloresMenu
