import { useEffect, useMemo, useRef, useState } from 'react'
import './Flores_menu.css'
import { supabase } from '../lib/supabaseClient'
import { useCart } from '../context/CartContext'

const assetModules = import.meta.glob('../assets/*/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default'
})

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
      name: name.replace(/_/g, ' '),
      images: sortedImages.map((image) => image.src),
      principalIndex: principalIndex >= 0 ? principalIndex : 0
    }
  })
  .filter((item) => item.images.length > 0)
  .sort((a, b) => a.name.localeCompare(b.name))

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

function formatPreparationTime(hours) {
  if (!Number.isFinite(hours) || hours <= 0) {
    return '24 h'
  }

  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24
    return `${days} dia${days === 1 ? '' : 's'}`
  }

  return `${hours} h`
}

function FloresMenu() {
  const [inventoryById, setInventoryById] = useState({})
  const [imageIndexByProduct, setImageIndexByProduct] = useState({})
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [sortByPrice, setSortByPrice] = useState('default')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const filtersDropdownRef = useRef(null)
  const { addToCart } = useCart()

  useEffect(() => {
    let isMounted = true

    async function loadInventory() {
      if (!supabase) {
        return
      }

      const { data, error } = await supabase
        .from('productos')
        .select('*')

      if (error) {
        console.error('Error cargando inventario desde Supabase:', error.message)
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
    }

    loadInventory()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!isFilterOpen) {
      return undefined
    }

    const handleOutsideClick = (event) => {
      if (!filtersDropdownRef.current) {
        return
      }

      if (!filtersDropdownRef.current.contains(event.target)) {
        setIsFilterOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isFilterOpen])

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
        price: Number.isNaN(parsedPrice) ? null : parsedPrice,
        stock: inventory?.stock ?? null,
        preparationHours: resolvePreparationHours(inventory)
      }
    })
  }, [inventoryById, imageIndexByProduct])

  const filteredProducts = useMemo(() => {
    const minValue = minPrice === '' ? null : Number(minPrice)
    const maxValue = maxPrice === '' ? null : Number(maxPrice)
    const hasMin = minValue != null && !Number.isNaN(minValue)
    const hasMax = maxValue != null && !Number.isNaN(maxValue)
    const lowerBound = hasMin && hasMax ? Math.min(minValue, maxValue) : minValue
    const upperBound = hasMin && hasMax ? Math.max(minValue, maxValue) : maxValue

    const filtered = products.filter((product) => {
      const hasPrice = typeof product.price === 'number'

      if (lowerBound != null) {
        if (!hasPrice || product.price < lowerBound) {
          return false
        }
      }

      if (upperBound != null) {
        if (!hasPrice || product.price > upperBound) {
          return false
        }
      }

      return true
    })

    if (sortByPrice === 'price-asc') {
      return [...filtered].sort((a, b) => {
        if (typeof a.price === 'number' && typeof b.price === 'number') {
          return a.price - b.price
        }

        if (typeof a.price === 'number') {
          return -1
        }

        if (typeof b.price === 'number') {
          return 1
        }

        return a.name.localeCompare(b.name)
      })
    }

    if (sortByPrice === 'price-desc') {
      return [...filtered].sort((a, b) => {
        if (typeof a.price === 'number' && typeof b.price === 'number') {
          return b.price - a.price
        }

        if (typeof a.price === 'number') {
          return -1
        }

        if (typeof b.price === 'number') {
          return 1
        }

        return a.name.localeCompare(b.name)
      })
    }

    return filtered
  }, [maxPrice, minPrice, products, sortByPrice])

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

  const resetFilters = () => {
    setSortByPrice('default')
    setMinPrice('')
    setMaxPrice('')
  }

  return (
    <section className="flores-menu" aria-label="Catalogo de flores y plantas">
      <div className="flores-menu__tabs-box">
        <h2 className="flores-menu__tabs-title">Flores y Plantas</h2>
        <div className="flores-menu__tabs" role="tablist" aria-label="Categorias de flores">
          <button type="button" className="flores-menu__tab">Ver todo</button>
          <button type="button" className="flores-menu__tab">Todas las flores</button>
          <button type="button" className="flores-menu__tab flores-menu__tab--active">Rosas</button>
          <button type="button" className="flores-menu__tab">Gerberas</button>
          <button type="button" className="flores-menu__tab">Tulipanes</button>
          <button type="button" className="flores-menu__tab">Orquideas</button>
          <button type="button" className="flores-menu__tab">Combinados</button>
          <button type="button" className="flores-menu__tab">Premium</button>
        </div>
      </div>

      <h3 className="flores-menu__headline">Rosas a domicilio en Guadalajara con entrega rapida para expresar amor</h3>

      <div className="flores-menu__actions">
        <div className="flores-menu__filters-dropdown" ref={filtersDropdownRef}>
          <button
            type="button"
            className="flores-menu__filter"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            aria-expanded={isFilterOpen}
            aria-controls="flores-menu-filters"
          >
            Filtrar y ordenar
          </button>
          {isFilterOpen && (
            <div className="flores-menu__filters-panel" id="flores-menu-filters">
              <div className="flores-menu__filters-group">
                <label className="flores-menu__filters-label" htmlFor="sort-by-price">
                  Ordenar por precio
                </label>
                <select
                  id="sort-by-price"
                  className="flores-menu__filters-input"
                  value={sortByPrice}
                  onChange={(event) => setSortByPrice(event.target.value)}
                >
                  <option value="default">Sin orden</option>
                  <option value="price-asc">Menor a mayor</option>
                  <option value="price-desc">Mayor a menor</option>
                </select>
              </div>

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

              <button type="button" className="flores-menu__filters-clear" onClick={resetFilters}>
                Limpiar
              </button>
            </div>
          )}
        </div>
        <span className="flores-menu__count">{filteredProducts.length} productos</span>
      </div>

      <div className="flores-menu__shelf" aria-label="Estante de productos">
        {filteredProducts.map((product) => (
          <article className="flores-menu__card" key={product.id}>
            <div className="flores-menu__image-wrap">
              <img className="flores-menu__image" src={product.image} alt={product.name} loading="lazy" />
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
              {typeof product.price === 'number' ? `$${product.price} MXN` : 'Precio no disponible'}
            </p>
            <p className="flores-menu__stock">
              {typeof product.stock === 'number'
                ? (product.stock > 0 ? `${product.stock} disponibles` : 'Agotado')
                : 'Stock no disponible'}
            </p>
            <p className="flores-menu__stock">Preparacion: {formatPreparationTime(product.preparationHours)}</p>
            <button
              type="button"
              className="flores-menu__add-button"
              onClick={() => addToCart(product)}
              disabled={typeof product.stock === 'number' && product.stock <= 0}
            >
              Agregar al carrito
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

export default FloresMenu
