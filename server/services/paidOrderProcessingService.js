import {
  buildWhatsAppTemplateParameters,
  sendWhatsAppBusinessMessage
} from './whatsappBusinessService.js'
import {
  getPaidOrderProcessingState,
  claimPaidOrderProcessingStage,
  updatePaidOrderProcessingState,
  upsertPaidOrder
} from './orderPersistenceService.js'

const activePaidOrderProcesses = new Map()
const CLAIM_SETTLE_WAIT_MS = 8 * 1000
const CLAIM_SETTLE_POLL_MS = 1000
const PDF_STAGE_CLAIM_TIMEOUT_MS = 15 * 1000
const WHATSAPP_STAGE_CLAIM_TIMEOUT_MS = 45 * 1000
const CLAIM_IN_PROGRESS_WARNING_PATTERNS = [
  /^pdf: otra instancia esta procesando el comprobante$/i,
  /^notificacion: otra instancia esta enviando WhatsApp$/i
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function hasOnlyClaimInProgressWarnings(stageErrors = []) {
  const normalizedErrors = Array.isArray(stageErrors)
    ? stageErrors
      .map((error) => String(error || '').trim())
      .filter(Boolean)
    : []

  return normalizedErrors.length > 0
    && normalizedErrors.every((error) => (
      CLAIM_IN_PROGRESS_WARNING_PATTERNS.some((pattern) => pattern.test(error))
    ))
}

async function waitForClaimedStagesToSettle({
  paymentId,
  orderId,
  waitForPdf = false,
  waitForWhatsapp = false,
  maxWaitMs = CLAIM_SETTLE_WAIT_MS,
  pollIntervalMs = CLAIM_SETTLE_POLL_MS
} = {}) {
  if ((!waitForPdf && !waitForWhatsapp) || maxWaitMs <= 0) {
    return null
  }

  const startedAt = Date.now()
  let latestState = null

  while ((Date.now() - startedAt) < maxWaitMs) {
    const elapsedMs = Date.now() - startedAt
    const remainingMs = maxWaitMs - elapsedMs
    await sleep(Math.min(pollIntervalMs, Math.max(remainingMs, 0)))

    try {
      latestState = await getPaidOrderProcessingState({ paymentId, orderId })
    } catch {
      continue
    }

    const pdfReady = !waitForPdf || Boolean(latestState?.pdf_generated_at)
    const whatsappReady = !waitForWhatsapp || Boolean(latestState?.whatsapp_sent_at)
    if (pdfReady && whatsappReady) {
      return latestState
    }
  }

  return latestState
}

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
  const processKey = String(paymentId || orderId || metadata?.order_id || '').trim()
  if (processKey && activePaidOrderProcesses.has(processKey)) {
    return activePaidOrderProcesses.get(processKey)
  }

  const processingPromise = processPaidOrderInternal({
    amountMxn,
    customerName,
    customerPhone,
    metadata,
    paidAt,
    paymentId,
    orderId,
    source,
    createReceiptPdf,
    logLabel,
    whatsappAccessToken,
    whatsappPhoneNumberId,
    whatsappRecipient,
    whatsappTemplateName,
    whatsappTemplateLanguageCode,
    whatsappApiVersion
  }).finally(() => {
    if (processKey) {
      activePaidOrderProcesses.delete(processKey)
    }
  })

  if (processKey) {
    activePaidOrderProcesses.set(processKey, processingPromise)
  }

  return processingPromise
}

async function processPaidOrderInternal({
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

  let pdfSkippedByClaim = false
  if (!existingState?.pdf_generated_at) {
    let pdfClaimed = true
    try {
      const claimResult = await claimPaidOrderProcessingStage({
        paymentId: normalizedPaymentId,
        orderId: normalizedOrderId,
        stage: 'pdf',
        claimTimeoutMs: PDF_STAGE_CLAIM_TIMEOUT_MS
      })
      pdfClaimed = Boolean(claimResult.claimed)
      if (claimResult.row) {
        existingState = claimResult.row
      }
    } catch (error) {
      pdfClaimed = false
      stageErrors.push(`pdf_claim: ${error?.message || error}`)
      console.warn(`[${logLabel}] fallo tomando claim de PDF:`, error?.message || error)
    }

    if (!pdfClaimed) {
      pdfSkippedByClaim = true
    }
  }

  if (!existingState?.pdf_generated_at && !pdfSkippedByClaim) {
    try {
      const pdfResult = await createReceiptPdf()
      await updatePaidOrderProcessingState({
        paymentId: normalizedPaymentId,
        orderId: normalizedOrderId,
        pdfPath: pdfResult.filePath,
        pdfGeneratedAt: new Date().toISOString(),
        pdfProcessingStartedAt: null
      })
      console.log(`[${logLabel}] PDF generado`, {
        paymentId: normalizedPaymentId,
        filePath: pdfResult.filePath
      })
    } catch (error) {
      stageErrors.push(`pdf: ${error?.message || error}`)
      console.warn(`[${logLabel}] fallo generando PDF:`, error?.message || error)
      try {
        await updatePaidOrderProcessingState({
          paymentId: normalizedPaymentId,
          orderId: normalizedOrderId,
          pdfProcessingStartedAt: null
        })
      } catch (clearError) {
        console.warn(`[${logLabel}] fallo liberando claim de PDF:`, clearError?.message || clearError)
      }
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

  let whatsappSkippedByClaim = false
  if (!existingState?.whatsapp_sent_at) {
    let whatsappClaimed = true
    try {
      const claimResult = await claimPaidOrderProcessingStage({
        paymentId: normalizedPaymentId,
        orderId: normalizedOrderId,
        stage: 'whatsapp',
        claimTimeoutMs: WHATSAPP_STAGE_CLAIM_TIMEOUT_MS
      })
      whatsappClaimed = Boolean(claimResult.claimed)
      if (claimResult.row) {
        existingState = claimResult.row
      }
    } catch (error) {
      whatsappClaimed = false
      stageErrors.push(`notificacion_claim: ${error?.message || error}`)
      console.warn(`[${logLabel}] fallo tomando claim de WhatsApp:`, error?.message || error)
    }

    if (!whatsappClaimed) {
      whatsappSkippedByClaim = true
    }
  }

  if (!existingState?.whatsapp_sent_at && !whatsappSkippedByClaim) {
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
        whatsappSentAt: new Date().toISOString(),
        whatsappProcessingStartedAt: null
      })
      console.log(`[${logLabel}] WhatsApp enviado`, {
        paymentId: normalizedPaymentId,
        recipient: whatsappResult?.recipient || 'unknown',
        messageId: whatsappResult?.responsePayload?.messages?.[0]?.id || 'unknown'
      })
    } catch (error) {
      stageErrors.push(`notificacion: ${error?.message || error}`)
      console.warn(`[${logLabel}] fallo enviando WhatsApp:`, error?.message || error)
      try {
        await updatePaidOrderProcessingState({
          paymentId: normalizedPaymentId,
          orderId: normalizedOrderId,
          whatsappProcessingStartedAt: null
        })
      } catch (clearError) {
        console.warn(`[${logLabel}] fallo liberando claim de WhatsApp:`, clearError?.message || clearError)
      }
    }
  } else if (existingState?.whatsapp_sent_at) {
    console.log(`[${logLabel}] WhatsApp ya enviado previamente, omitiendo duplicado`, {
      paymentId: normalizedPaymentId
    })
  }

  if (pdfSkippedByClaim || whatsappSkippedByClaim) {
    console.log(`[${logLabel}] esperando a que otra instancia termine el post-pago`, {
      paymentId: normalizedPaymentId,
      waitForPdf: pdfSkippedByClaim && !existingState?.pdf_generated_at,
      waitForWhatsapp: whatsappSkippedByClaim && !existingState?.whatsapp_sent_at
    })

    try {
      const settledState = await waitForClaimedStagesToSettle({
        paymentId: normalizedPaymentId,
        orderId: normalizedOrderId,
        waitForPdf: pdfSkippedByClaim && !existingState?.pdf_generated_at,
        waitForWhatsapp: whatsappSkippedByClaim && !existingState?.whatsapp_sent_at
      })
      if (settledState) {
        existingState = settledState
      }
    } catch {
      // keep previous state so the caller can decide whether to retry
    }
  }

  if (pdfSkippedByClaim && !existingState?.pdf_generated_at) {
    stageErrors.push('pdf: otra instancia esta procesando el comprobante')
  }
  if (whatsappSkippedByClaim && !existingState?.whatsapp_sent_at) {
    stageErrors.push('notificacion: otra instancia esta enviando WhatsApp')
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
