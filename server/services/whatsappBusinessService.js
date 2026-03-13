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

function buildLocationLine({ deliveryAddress, deliveryNeighborhood, deliveryCity, deliveryPostalCode } = {}) {
  return [
    String(deliveryAddress || '').trim(),
    String(deliveryNeighborhood || '').trim(),
    String(deliveryCity || '').trim(),
    String(deliveryPostalCode || '').trim()
  ]
    .filter(Boolean)
    .join(', ')
}

function formatCartItemsSummary(cartItemsSummary) {
  const rawValue = String(cartItemsSummary || '').trim()
  if (!rawValue) {
    return ['Sin detalle']
  }

  return rawValue
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
}

function compactSingleLine(value, fallback = 'N/A', maxLength = 160) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return fallback
  }

  return normalized.slice(0, maxLength)
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
  deliveryCity,
  deliveryAddress,
  deliveryNeighborhood,
  deliveryPostalCode,
  recipientName,
  flowerMessage,
  specialInstructions,
  cartItemsSummary
} = {}) {
  // Stripe reports minor units; MP usually reports major units.
  const resolvedAmount = Number.isFinite(Number(amount))
    ? Number(amount)
    : toMajorAmountFromMinor(amountInMinor)
  const locationLine = buildLocationLine({
    deliveryAddress,
    deliveryNeighborhood,
    deliveryCity,
    deliveryPostalCode
  })
  const productLines = formatCartItemsSummary(cartItemsSummary)

  const lines = [
    'PEDIDO CONFIRMADO',
    '',
    'Pago',
    `Proveedor: ${provider || 'N/A'}`,
    `Folio: ${paymentId || 'N/A'}`,
    `Orden: ${orderId || 'N/A'}`,
    `Monto: ${formatAmount(resolvedAmount, currency || 'MXN')}`,
    '',
    'Cliente',
    `Nombre: ${customerName || 'N/A'}`,
    `Telefono: ${customerPhone || 'N/A'}`,
    `Email: ${customerEmail || 'N/A'}`,
    '',
    'Entrega',
    `Tipo: ${deliveryType || 'N/A'}`,
    `Fecha: ${deliveryDate || 'N/A'}`,
    `Horario: ${deliveryTime || 'N/A'}`,
    `Recibe: ${recipientName || customerName || 'N/A'}`,
    `Ubicacion: ${locationLine || deliveryCity || 'N/A'}`,
    ''
  ]

  if (flowerMessage) {
    lines.push('Mensaje para la flor')
    lines.push(String(flowerMessage).trim())
    lines.push('')
  }

  if (specialInstructions) {
    lines.push('Indicaciones')
    lines.push(String(specialInstructions).trim())
    lines.push('')
  }

  lines.push('Productos')
  productLines.forEach((item) => {
    lines.push(`- ${item}`)
  })

  return lines.join('\n')
}

export function buildWhatsAppTemplateParameters({
  orderId,
  paymentId,
  customerName,
  recipientName,
  deliveryDate,
  deliveryTime,
  deliveryCity,
  deliveryAddress,
  deliveryNeighborhood,
  deliveryPostalCode,
  customerPhone,
  cartItemsSummary
} = {}) {
  const locationLine = buildLocationLine({
    deliveryAddress,
    deliveryNeighborhood,
    deliveryCity,
    deliveryPostalCode
  })

  return [
    compactSingleLine(orderId),
    compactSingleLine(paymentId),
    compactSingleLine(customerName),
    compactSingleLine(recipientName || customerName),
    compactSingleLine(cartItemsSummary, 'Sin detalle', 300),
    compactSingleLine(deliveryDate),
    compactSingleLine(deliveryTime),
    compactSingleLine(locationLine || deliveryCity),
    compactSingleLine(customerPhone)
  ]
}

export async function sendWhatsAppBusinessMessage({
  whatsappAccessToken,
  whatsappPhoneNumberId,
  whatsappRecipient,
  whatsappTemplateName,
  whatsappTemplateLanguageCode = 'es_MX',
  whatsappApiVersion = 'v22.0',
  whatsappTemplateParameters,
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
          language: { code: String(whatsappTemplateLanguageCode || 'es_MX') },
          ...(Array.isArray(whatsappTemplateParameters) && whatsappTemplateParameters.length > 0
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: whatsappTemplateParameters.map((parameter) => ({
                      type: 'text',
                      text: compactSingleLine(parameter, 'N/A', 300)
                    }))
                  }
                ]
              }
            : {})
        }
      }
    : {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: {
          // Meta API hard limit for text body is 4096 chars.
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

  const responsePayload = await response.json()
  return {
    recipient,
    payload,
    responsePayload
  }
}
