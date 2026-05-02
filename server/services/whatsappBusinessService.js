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

function isCourseFulfillment(deliveryType) {
  const normalized = String(deliveryType || '').trim().toLowerCase()
  return normalized === 'course' || normalized === 'curso'
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

function maskIdentifier(value, visibleDigits = 4) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return ''
  }

  const visible = normalized.slice(-visibleDigits)
  return `${'*'.repeat(Math.max(normalized.length - visible.length, 0))}${visible}`
}

function summarizeTemplateParameters(parameters = []) {
  if (!Array.isArray(parameters)) {
    return []
  }

  return parameters.map((parameter, index) => {
    if (parameter !== null && typeof parameter === 'object') {
      return {
        index,
        name: parameter.name || null,
        hasValue: Boolean(String(parameter.value || '').trim()),
        valueLength: String(parameter.value || '').length
      }
    }

    return {
      index,
      name: null,
      hasValue: Boolean(String(parameter || '').trim()),
      valueLength: String(parameter || '').length
    }
  })
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
  const isCourse = isCourseFulfillment(deliveryType)

  const lines = [
    isCourse ? 'CURSO CONFIRMADO' : 'PEDIDO CONFIRMADO',
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
    isCourse ? 'Curso' : 'Entrega',
    `Tipo: ${isCourse ? 'Curso' : (deliveryType || 'N/A')}`,
    `Fecha: ${deliveryDate || 'N/A'}`,
    `Horario: ${deliveryTime || 'N/A'}`,
    `Recibe: ${recipientName || customerName || 'N/A'}`,
    `${isCourse ? 'Lugar' : 'Ubicacion'}: ${locationLine || deliveryCity || (isCourse ? 'Margot Expo' : 'N/A')}`,
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
  deliveryType,
  deliveryDate,
  deliveryTime,
  deliveryCity,
  deliveryAddress,
  deliveryNeighborhood,
  deliveryPostalCode,
  customerPhone,
  cartItemsSummary,
  flowerMessage,
  specialInstructions
} = {}) {
  const locationLine = buildLocationLine({
    deliveryAddress,
    deliveryNeighborhood,
    deliveryCity,
    deliveryPostalCode
  })
  const isCourse = isCourseFulfillment(deliveryType)
  const isPickup = String(deliveryType || '').trim().toLowerCase() === 'pickup'
  const courseLocation = locationLine || deliveryCity

  return [
    { name: 'order_id',             value: compactSingleLine(orderId) },
    { name: 'payment_id',           value: compactSingleLine(paymentId) },
    { name: 'customer_name',        value: compactSingleLine(customerName) },
    { name: 'recipient_name',       value: compactSingleLine(recipientName || customerName) },
    { name: 'cart_items',           value: compactSingleLine(cartItemsSummary, 'Sin detalle', 300) },
    { name: 'delivery_date',        value: compactSingleLine(deliveryDate) },
    { name: 'delivery_time',        value: compactSingleLine(deliveryTime) },
    { name: 'delivery_location',    value: isCourse ? compactSingleLine(courseLocation ? `Curso en ${courseLocation}` : 'Curso en Margot Expo') : (isPickup ? 'Se recoge en tienda' : compactSingleLine(locationLine || deliveryCity)) },
    { name: 'customer_phone',       value: compactSingleLine(customerPhone) },
    { name: 'flower_message',       value: compactSingleLine(flowerMessage, 'Sin mensaje', 300) },
    { name: 'special_instructions', value: compactSingleLine(specialInstructions, 'Sin instrucciones', 300) }
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
    console.warn('[whatsapp] configuracion incompleta', {
      hasAccessToken: Boolean(accessToken),
      hasPhoneNumberId: Boolean(phoneNumberId),
      hasRecipient: Boolean(recipient)
    })
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
                    parameters: whatsappTemplateParameters.map((parameter) => {
                      const isNamed = parameter !== null && typeof parameter === 'object' && 'value' in parameter
                      const textValue = isNamed ? parameter.value : parameter
                      return { type: 'text', text: compactSingleLine(textValue, 'N/A', 300) }
                    })
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

  console.log('[whatsapp] solicitud enviada a Meta', {
    apiVersion: String(whatsappApiVersion || 'v22.0'),
    phoneNumberId: maskIdentifier(phoneNumberId),
    recipient: maskIdentifier(recipient),
    recipientDigits: recipient.length,
    mode: whatsappTemplateName ? 'template' : 'text',
    templateName: whatsappTemplateName ? String(whatsappTemplateName) : null,
    templateLanguage: whatsappTemplateName ? String(whatsappTemplateLanguageCode || 'es_MX') : null,
    bodyParameterCount: Array.isArray(whatsappTemplateParameters) ? whatsappTemplateParameters.length : 0,
    bodyParameters: summarizeTemplateParameters(whatsappTemplateParameters),
    status: response.status,
    ok: response.ok
  })

  if (!response.ok) {
    const details = await response.text()
    console.warn('[whatsapp] Meta rechazo el envio', {
      status: response.status,
      details
    })
    throw new Error(`WhatsApp Business rechazo el envio (${response.status}): ${details}`)
  }

  const responsePayload = await response.json()
  console.log('[whatsapp] Meta acepto el envio', {
    recipient: maskIdentifier(recipient),
    messageId: responsePayload?.messages?.[0]?.id || 'unknown'
  })

  return {
    recipient,
    payload,
    responsePayload
  }
}
