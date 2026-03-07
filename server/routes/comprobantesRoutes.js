import { Router } from 'express'
import { upsertPaidOrder } from '../services/orderPersistenceService.js'

function buildItemsSummary(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return ''
  }
  return items
    .map((item) => `${String(item?.name || 'Producto').trim()} x${Number(item?.quantity || 0)}`)
    .join(' | ')
}

export function createComprobantesRouter() {
  const router = Router()

  router.post('/confirm-paid', async (req, res) => {
    try {
      const {
        amount,
        approvedAt,
        items,
        deliveryDetails,
        selectedDeliveryCity,
        selectedDeliveryDate,
        selectedDeliveryTime
      } = req.body || {}

      const metadata = {
        customer_name: String(deliveryDetails?.fullName || '').trim(),
        customer_phone: String(deliveryDetails?.phone || '').trim(),
        cart_items_summary: buildItemsSummary(items),
        delivery_city: String(selectedDeliveryCity || '').trim(),
        delivery_address: String(deliveryDetails?.streetAddress || '').trim(),
        delivery_neighborhood: String(deliveryDetails?.neighborhood || '').trim(),
        delivery_postal_code: String(deliveryDetails?.postalCode || '').trim(),
        delivery_date: String(selectedDeliveryDate || '').trim(),
        delivery_time: String(selectedDeliveryTime || '').trim()
      }

      await upsertPaidOrder({
        amountMxn: amount,
        customerName: metadata.customer_name,
        customerPhone: metadata.customer_phone,
        metadata,
        paidAt: approvedAt || new Date().toISOString()
      })

      return res.status(200).json({ ok: true })
    } catch (error) {
      console.error('[comprobantes] error guardando confirm-paid:', error?.message || error)
      return res.status(500).json({ error: error?.message || 'No se pudo guardar comprobante' })
    }
  })

  return router
}
