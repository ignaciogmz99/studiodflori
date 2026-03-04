function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeRecipientPhone(value) {
  const digits = digitsOnly(value)
  if (!digits) {
    return ''
  }
  if (digits.startsWith('00')) {
    return digits.slice(2)
  }
  return digits
}

function toMajorAmountFromMinor(amountInMinor) {
  const amount = Number(amountInMinor)
  if (!Number.isFinite(amount)) {
    return 0
  }
  return amount / 100
}

function formatAmount(amount, currency) {
  const normalizedAmount = Number(amount)
  if (!Number.isFinite(normalizedAmount)) {
    return `0.00 ${String(currency || 'MXN').toUpperCase()}`
  }
  return `${normalizedAmount.toFixed(2)} ${String(currency || 'MXN').toUpperCase()}`
}

export function buildWhatsAppReceiptMessage({
  provider,
  paymentId,
  orderId,
  amount,
  amountInMinor,
  currency,
  customerName,
  customerPhone,
  customerEmail,
  deliveryType,
  deliveryDate,
  deliveryTime,
  deliveryCity
} = {}) {
  const resolvedAmount = Number.isFinite(Number(amount))
    ? Number(amount)
    : toMajorAmountFromMinor(amountInMinor)

  const lines = [
    'Nuevo pago confirmado',
    `Proveedor: ${provider || 'N/A'}`,
    `Folio de pago: ${paymentId || 'N/A'}`,
    `Orden: ${orderId || 'N/A'}`,
    `Monto: ${formatAmount(resolvedAmount, currency || 'MXN')}`,
    '',
    'Cliente:',
    `Nombre: ${customerName || 'N/A'}`,
    `Telefono: ${customerPhone || 'N/A'}`,
    `Email: ${customerEmail || 'N/A'}`,
    '',
    'Entrega:',
    `Tipo: ${deliveryType || 'N/A'}`,
    `Fecha: ${deliveryDate || 'N/A'}`,
    `Horario: ${deliveryTime || 'N/A'}`,
    `Ciudad: ${deliveryCity || 'N/A'}`
  ]

  return lines.join('\n')
}

export async function sendWhatsAppBusinessMessage({
  whatsappAccessToken,
  whatsappPhoneNumberId,
  whatsappRecipient,
  whatsappTemplateName,
  whatsappTemplateLanguageCode = 'es_MX',
  whatsappApiVersion = 'v22.0',
  textBody
} = {}) {
  const accessToken = String(whatsappAccessToken || '').trim()
  const phoneNumberId = String(whatsappPhoneNumberId || '').trim()
  const recipient = normalizeRecipientPhone(whatsappRecipient)

  if (!accessToken || !phoneNumberId || !recipient) {
    throw new Error('Faltan variables de WhatsApp Business (token, phone_number_id o destinatario)')
  }

  const payload = whatsappTemplateName
    ? {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: String(whatsappTemplateName),
          language: { code: String(whatsappTemplateLanguageCode || 'es_MX') }
        }
      }
    : {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: {
          preview_url: false,
          body: String(textBody || '').slice(0, 4096)
        }
      }

  const response = await fetch(`https://graph.facebook.com/${String(whatsappApiVersion || 'v22.0')}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`WhatsApp Business rechazo el envio (${response.status}): ${details}`)
  }
}
