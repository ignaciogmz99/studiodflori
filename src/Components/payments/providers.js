import MercadoPagoPayment from './MercadoPagoPayment'

export const paymentProviders = [
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
