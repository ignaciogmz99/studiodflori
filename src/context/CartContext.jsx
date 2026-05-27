/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { DELIVERY_CITIES } from '../constants/deliveryCities'
import { DIA_MADRES_FILTER_KEY } from '../constants/promoProducts'
import {
  cartSupportsLockedMothersDayDates,
  isLockedMothersDayDateBlockedForCart,
  isMothersDayCatalogLocked,
  resolveInitialFlowerType
} from '../lib/mothersDayCatalog'
import { trackAddToCart } from '../lib/analytics'
import { supabase } from '../lib/supabaseClient'

const CartContext = createContext(null)
const CART_STORAGE_KEY = 'studiodflori_cart_v1'
const COURSE_PRODUCT_ID = 'Curso'
const INITIAL_DELIVERY_DETAILS = {
  fulfillmentType: 'delivery',
  fullName: '',
  phoneCountryCode: '+52',
  phone: '',
  recipientType: 'self',
  recipientName: '',
  streetAddress: '',
  neighborhood: '',
  postalCode: '',
  specialInstructions: '',
  flowerMessage: ''
}

function readStoredCart() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => readStoredCart())
  const [isPaymentView, setIsPaymentView] = useState(false)
  const [isCardView, setIsCardView] = useState(false)
  const [selectedFlower, setSelectedFlower] = useState(null)
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState('')
  const [selectedDeliveryTime, setSelectedDeliveryTime] = useState('')
  const [selectedDeliveryCity, setSelectedDeliveryCity] = useState(DELIVERY_CITIES[0])
  const [deliveryDetails, setDeliveryDetails] = useState(INITIAL_DELIVERY_DETAILS)
  const [selectedFlowerType, setSelectedFlowerType] = useState(() => resolveInitialFlowerType(new Date()))
  const [flowerTypeTabs, setFlowerTypeTabs] = useState([])
  const canScheduleLockedMothersDayDates = useMemo(
    () => cartSupportsLockedMothersDayDates(items),
    [items]
  )
  const mothersDayCatalogLocked = useMemo(
    () => isMothersDayCatalogLocked(selectedDeliveryDate),
    [selectedDeliveryDate]
  )
  const hasBlockedMothersDayDeliverySelection = useMemo(
    () => isLockedMothersDayDateBlockedForCart(selectedDeliveryDate, items),
    [items, selectedDeliveryDate]
  )
  const hasCourseItem = useMemo(
    () => items.some((item) => item.itemType === 'course' || item.id === COURSE_PRODUCT_ID),
    [items]
  )
  const hasOnlyCourseItems = useMemo(
    () => items.length > 0 && items.every((item) => item.itemType === 'course' || item.id === COURSE_PRODUCT_ID),
    [items]
  )

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
  }, [items])

  useEffect(() => {
    if (mothersDayCatalogLocked && selectedFlowerType !== DIA_MADRES_FILTER_KEY) {
      setSelectedFlowerType(DIA_MADRES_FILTER_KEY)
    }
  }, [mothersDayCatalogLocked, selectedFlowerType])

  const addToCart = (product) => {
    setItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.id === product.id)

      if (existingItem) {
        return currentItems.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }

      return [
        ...currentItems,
        {
          id: product.id,
          name: product.name,
          image: product.image,
          price: typeof product.price === 'number' ? product.price : 0,
          preparationHours: typeof product.preparationHours === 'number' ? product.preparationHours : 24,
          itemType: product.itemType || 'product',
          fulfillmentType: product.fulfillmentType || 'delivery',
          quantity: 1
        }
      ]
    })

    trackAddToCart(product)
  }

  const removeFromCart = (productId) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== productId))
  }

  const decreaseQuantity = (productId) => {
    setItems((currentItems) =>
      currentItems
        .map((item) => (
          item.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        ))
        .filter((item) => item.quantity > 0)
    )
  }

  const clearCart = () => {
    setItems([])
    setSelectedDeliveryDate('')
    setSelectedDeliveryTime('')
    setSelectedDeliveryCity(DELIVERY_CITIES[0])
    setDeliveryDetails(INITIAL_DELIVERY_DETAILS)
  }

  const openPaymentView = () => {
    setIsCardView(false)
    setIsPaymentView(true)
  }

  const openCardView = () => {
    setIsCardView(true)
  }

  const backToPaymentForm = () => {
    setIsCardView(false)
  }

  const closePaymentView = () => {
    setIsCardView(false)
    setIsPaymentView(false)
  }

  const clearSelectedFlower = () => {
    setSelectedFlower(null)
  }

  const totalItems = useMemo(() => {
    return items.reduce((sum, item) => sum + item.quantity, 0)
  }, [items])

  const totalPrice = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  }, [items])

  const DELIVERY_FEE_PRODUCT_ID = 'Envio_Domicilio'
  const [deliveryFee, setDeliveryFee] = useState(100)

  useEffect(() => {
    if (!supabase) {
      return
    }

    supabase
      .from('productos')
      .select('precio')
      .eq('id', DELIVERY_FEE_PRODUCT_ID)
      .single()
      .then(({ data }) => {
        if (data?.precio) setDeliveryFee(Number(data.precio))
      })
  }, [])

  const isDelivery = !hasOnlyCourseItems && deliveryDetails.fulfillmentType !== 'pickup'

  const itemsForPayment = useMemo(() => {
    if (!isDelivery) return items
    return [
      ...items,
      { id: DELIVERY_FEE_PRODUCT_ID, name: 'Envío a domicilio', price: deliveryFee, quantity: 1, image: null }
    ]
  }, [items, isDelivery, deliveryFee])

  const totalWithDelivery = useMemo(() => {
    return totalPrice + (isDelivery ? deliveryFee : 0)
  }, [totalPrice, isDelivery, deliveryFee])

  const estimatedPreparationHours = useMemo(() => {
    return items.reduce((maxHours, item) => {
      const itemHours = typeof item.preparationHours === 'number' && item.preparationHours > 0
        ? item.preparationHours
        : 24

      return Math.max(maxHours, itemHours)
    }, 0)
  }, [items])

  const value = useMemo(() => ({
    items,
    addToCart,
    removeFromCart,
    decreaseQuantity,
    clearCart,
    isPaymentView,
    isCardView,
    openPaymentView,
    openCardView,
    backToPaymentForm,
    closePaymentView,
    selectedFlower,
    setSelectedFlower,
    clearSelectedFlower,
    selectedDeliveryDate,
    selectedDeliveryTime,
    selectedDeliveryCity,
    deliveryDetails,
    setSelectedDeliveryDate,
    setSelectedDeliveryTime,
    setSelectedDeliveryCity,
    setDeliveryDetails,
    totalItems,
    totalPrice,
    totalWithDelivery,
    itemsForPayment,
    deliveryFee,
    estimatedPreparationHours,
    selectedFlowerType,
    setSelectedFlowerType,
    isMothersDayCatalogLocked: mothersDayCatalogLocked,
    canScheduleLockedMothersDayDates,
    hasBlockedMothersDayDeliverySelection,
    flowerTypeTabs,
    setFlowerTypeTabs,
    hasCourseItem,
    hasOnlyCourseItems
  }), [
    canScheduleLockedMothersDayDates,
    estimatedPreparationHours,
    deliveryDetails,
    hasBlockedMothersDayDeliverySelection,
    isCardView,
    isPaymentView,
    items,
    selectedFlower,
    selectedDeliveryDate,
    selectedDeliveryCity,
    selectedDeliveryTime,
    totalItems,
    totalPrice,
    totalWithDelivery,
    itemsForPayment,
    deliveryFee,
    selectedFlowerType,
    mothersDayCatalogLocked,
    flowerTypeTabs,
    hasCourseItem,
    hasOnlyCourseItems
  ])

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)

  if (!context) {
    throw new Error('useCart debe usarse dentro de CartProvider')
  }

  return context
}
