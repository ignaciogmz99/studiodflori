import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { supabase } from '../lib/supabaseClient'
import { localProducts, normalizeFlowerType, resolvePreparationHours } from './Flores_menu.jsx'

function buildProductForDetail(product, inventory = null, isInventoryLoading = false) {
  const parsedPrice = inventory?.precio == null ? null : Number(inventory.precio)
  const parsedOriginalPrice = inventory?.precio_original == null
    ? Number(inventory?.precioOriginal)
    : Number(inventory.precio_original)
  const normalizedIndex = product.images.length
    ? ((product.principalIndex % product.images.length) + product.images.length) % product.images.length
    : 0

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
    isInventoryLoading,
    descripcion: inventory?.descripcion ?? inventory?.descripción ?? null
  }
}

function ProductLoader() {
  const { id } = useParams()
  const { setSelectedFlower } = useCart()
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true
    const product = localProducts.find((p) => p.id === id)

    if (!product) {
      navigate('/', { replace: true })
      return
    }

    setSelectedFlower((current) => {
      if (current?.id === id && current.hasInventoryRecord && !current.isInventoryLoading) {
        return current
      }

      return buildProductForDetail(product, null, Boolean(supabase))
    })

    async function loadProductInventory() {
      if (!supabase) {
        setSelectedFlower(buildProductForDetail(product, null, false))
        return
      }

      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (!isMounted) {
        return
      }

      if (error) {
        console.error('Error cargando producto desde Supabase:', error.message)
        setSelectedFlower(buildProductForDetail(product, null, false))
        return
      }

      const inventory = data?.activo === false ? null : data
      setSelectedFlower(buildProductForDetail(product, inventory, false))
    }

    loadProductInventory()

    return () => {
      isMounted = false
    }
  }, [id, setSelectedFlower, navigate])

  return null
}

export default ProductLoader
