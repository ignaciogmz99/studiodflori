import { Router } from 'express'

export function createMercadoPagoWebhookRouter() {
  const router = Router()

  router.post('/', async (req, res) => {
    try {
      const topic = String(req.query?.topic || req.body?.type || '').trim()
      const id = String(req.query?.id || req.body?.data?.id || '').trim()

      console.log('[MP webhook] recibido', { topic, id })

      // TODO: consultar Mercado Pago API por id y persistir estado de pago/pedido.
      return res.status(200).json({ received: true })
    } catch (error) {
      console.error('Error procesando webhook de Mercado Pago:', error)
      return res.status(500).json({ error: 'Error procesando webhook de Mercado Pago' })
    }
  })

  return router
}
