import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { localProducts } from './Flores_menu.jsx'

function ProductLoader() {
  const { id } = useParams()
  const { setSelectedFlower, selectedFlower } = useCart()
  const navigate = useNavigate()

  useEffect(() => {
    const product = localProducts.find((p) => p.id === id)
    if (!product) {
      navigate('/', { replace: true })
      return
    }
    if (!selectedFlower || selectedFlower.id !== id) {
      setSelectedFlower(product)
    }
  }, [id, setSelectedFlower, selectedFlower, navigate])

  return null
}

export default ProductLoader
