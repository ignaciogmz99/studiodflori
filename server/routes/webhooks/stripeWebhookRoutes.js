import { Router } from 'express'

export function createStripeWebhookRouter() {
  const router = Router()

  router.post('/', async (req, res) => {
    try {
      const eventType = String(req.body?.type || '').trim()
      const eventId = String(req.body?.id || '').trim()

      console.log('[Stripe webhook] recibido', { eventType, eventId })

      // TODO: validar firma con STRIPE_WEBHOOK_SECRET y persistir estado de pago/pedido.
      return res.status(200).json({ received: true })
    } catch (error) {
      console.error('Error procesando webhook de Stripe:', error)
      return res.status(500).json({ error: 'Error procesando webhook de Stripe' })
    }
  })

  return router
}
