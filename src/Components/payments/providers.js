import MercadoPagoPayment from './MercadoPagoPayment'
import StripePayment from './StripePayment'

export const paymentProviders = [
  {
    id: 'stripe',
    label: 'Stripe',
    summary: 'Paga de forma segura con tu tarjeta de credito o debito a traves de Stripe.',
    Component: StripePayment
  },
  {
    id: 'mercadopago',
    label: 'Mercado Pago',
    summary: 'Completa tu pago con Mercado Pago sin salir de esta pagina.',
    Component: MercadoPagoPayment
  }
]

export const defaultPaymentProvider = paymentProviders[0].id

export function getPaymentProvider(providerId) {
  return paymentProviders.find((provider) => provider.id === providerId) || paymentProviders[0]
}
