import {
  buildWhatsAppTemplateParameters,
  sendWhatsAppBusinessMessage
} from './whatsappBusinessService.js'
import {
  getPaidOrderProcessingState,
  updatePaidOrderProcessingState,
  upsertPaidOrder
} from './orderPersistenceService.js'

export async function processPaidOrder({
  amountMxn,
  customerName,
  customerPhone,
  metadata = {},
  paidAt,
  paymentId,
  orderId,
  source,
  createReceiptPdf,
  logLabel = 'payment',
  whatsappAccessToken,
  whatsappPhoneNumberId,
  whatsappRecipient,
  whatsappTemplateName,
  whatsappTemplateLanguageCode,
  whatsappApiVersion
} = {}) {
  const normalizedPaymentId = String(paymentId || '').trim()
  const normalizedOrderId = String(orderId || metadata?.order_id || '').trim()
  const stageErrors = []

  let existingState = await getPaidOrderProcessingState({
    paymentId: normalizedPaymentId,
    orderId: normalizedOrderId
  })

  if (existingState?.pdf_generated_at && existingState?.whatsapp_sent_at) {
    return {
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId,
      duplicated: true,
      processed: true,
      processedWithWarnings: false,
      stageErrors,
      state: existingState
    }
  }

  let persistenceSucceeded = false
  try {
    const persistenceResult = await upsertPaidOrder({
      amountMxn,
      customerName: String(customerName || metadata?.customer_name || '').trim(),
      customerPhone: String(customerPhone || metadata?.customer_phone || '').trim(),
      metadata: {
        ...metadata,
        order_id: normalizedOrderId
      },
      paidAt,
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId,
      source
    })
    persistenceSucceeded = Boolean(persistenceResult?.persisted)
    existingState = persistenceResult?.row || existingState
  } catch (error) {
    stageErrors.push(`persistencia: ${error?.message || error}`)
    console.warn(`[${logLabel}] fallo persistiendo comprobante:`, error?.message || error)
  }

  if (!persistenceSucceeded) {
    return {
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId,
      duplicated: false,
      processed: false,
      processedWithWarnings: false,
      stageErrors,
      state: existingState
    }
  }

  if (!existingState?.pdf_generated_at) {
    try {
      const pdfResult = await createReceiptPdf()
      await updatePaidOrderProcessingState({
        paymentId: normalizedPaymentId,
        orderId: normalizedOrderId,
        pdfPath: pdfResult.filePath,
        pdfGeneratedAt: new Date().toISOString()
      })
      console.log(`[${logLabel}] PDF generado`, {
        paymentId: normalizedPaymentId,
        filePath: pdfResult.filePath
      })
    } catch (error) {
      stageErrors.push(`pdf: ${error?.message || error}`)
      console.warn(`[${logLabel}] fallo generando PDF:`, error?.message || error)
    }
  }

  try {
    const freshState = await getPaidOrderProcessingState({
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId
    })
    if (freshState) existingState = freshState
  } catch {
    // keep previous state
  }

  if (!existingState?.whatsapp_sent_at) {
    try {
      const whatsappTemplateParameters = buildWhatsAppTemplateParameters({
        orderId: normalizedOrderId,
        paymentId: normalizedPaymentId,
        customerName: metadata.customer_name,
        recipientName: String(metadata.recipient_name || metadata.customer_name || '').trim(),
        cartItemsSummary: metadata.cart_items_summary,
        deliveryDate: metadata.delivery_date,
        deliveryTime: metadata.delivery_time,
        deliveryCity: metadata.delivery_city,
        deliveryAddress: metadata.delivery_address,
        deliveryNeighborhood: metadata.delivery_neighborhood,
        deliveryPostalCode: metadata.delivery_postal_code,
        customerPhone: metadata.customer_phone,
        flowerMessage: metadata.flower_message,
        specialInstructions: metadata.delivery_notes,
        deliveryType: metadata.fulfillment_type
      })
      const whatsappResult = await sendWhatsAppBusinessMessage({
        whatsappAccessToken,
        whatsappPhoneNumberId,
        whatsappRecipient,
        whatsappApiVersion,
        whatsappTemplateName,
        whatsappTemplateLanguageCode,
        whatsappTemplateParameters
      })
      await updatePaidOrderProcessingState({
        paymentId: normalizedPaymentId,
        orderId: normalizedOrderId,
        whatsappSentAt: new Date().toISOString()
      })
      console.log(`[${logLabel}] WhatsApp enviado`, {
        paymentId: normalizedPaymentId,
        recipient: whatsappResult?.recipient || 'unknown',
        messageId: whatsappResult?.responsePayload?.messages?.[0]?.id || 'unknown'
      })
    } catch (error) {
      stageErrors.push(`notificacion: ${error?.message || error}`)
      console.warn(`[${logLabel}] fallo enviando WhatsApp:`, error?.message || error)
    }
  } else {
    console.log(`[${logLabel}] WhatsApp ya enviado previamente, omitiendo duplicado`, {
      paymentId: normalizedPaymentId
    })
  }

  return {
    paymentId: normalizedPaymentId,
    orderId: normalizedOrderId,
    duplicated: false,
    processed: true,
    processedWithWarnings: stageErrors.length > 0,
    stageErrors,
    state: existingState
  }
}
