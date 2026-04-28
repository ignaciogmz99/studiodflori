/* global process */
import { randomUUID } from 'node:crypto'
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
const CLAIM_RECOVERY_DELAY_BUFFER_MS = 1500
const MAX_CLAIM_RECOVERY_ATTEMPTS = 2
const CLAIM_IN_PROGRESS_WARNING_PATTERNS = [
  /^pdf: otra instancia esta procesando el comprobante$/i,
  /^notificacion: otra instancia esta enviando WhatsApp$/i
]
const PROCESS_INSTANCE_LABEL = [
  String(process.env.RAILWAY_SERVICE_NAME || '').trim(),
  String(process.env.RAILWAY_REPLICA_ID || '').trim(),
  String(process.env.RAILWAY_DEPLOYMENT_ID || '').trim(),
  String(process.env.HOSTNAME || '').trim(),
  `pid:${process.pid}`
].filter(Boolean).join('|')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function summarizeProcessingState(state = {}) {
  if (!state || typeof state !== 'object') {
    return null
  }

  return {
    payment_id: state.payment_id || null,
    order_id: state.order_id || null,
    pdf_generated_at: state.pdf_generated_at || null,
    whatsapp_sent_at: state.whatsapp_sent_at || null,
    pdf_processing_started_at: state.pdf_processing_started_at || null,
    whatsapp_processing_started_at: state.whatsapp_processing_started_at || null,
    pdf_processing_owner: state.pdf_processing_owner || null,
    whatsapp_processing_owner: state.whatsapp_processing_owner || null,
    processing_last_event: state.processing_last_event || null,
    processing_last_error: state.processing_last_error || null,
    processing_last_actor: state.processing_last_actor || null,
    processing_updated_at: state.processing_updated_at || null
  }
}

function formatErrorMessage(error) {
  if (!error) {
    return ''
  }

  const message = error instanceof Error
    ? `${error.message}${error.stack ? ` | ${error.stack}` : ''}`
    : String(error)

  return message.trim().slice(0, 1000)
}

async function recordProcessingEvent({
  paymentId,
  orderId,
  logLabel,
  event,
  actor,
  errorMessage,
  pdfProcessingOwner,
  whatsappProcessingOwner
} = {}) {
  try {
    await updatePaidOrderProcessingState({
      paymentId,
      orderId,
      pdfProcessingOwner,
      whatsappProcessingOwner,
      processingLastEvent: event,
      processingLastError: errorMessage !== undefined ? errorMessage : null,
      processingLastActor: actor,
      processingUpdatedAt: new Date().toISOString()
    })
  } catch (error) {
    console.warn(`[${logLabel}] fallo registrando diagnostico ${event || 'unknown'}:`, error?.message || error)
  }
}

function getRemainingClaimDelayMs(claimStartedAt, timeoutMs) {
  const parsedClaimStartedAt = Date.parse(String(claimStartedAt || ''))
  if (!Number.isFinite(parsedClaimStartedAt)) {
    return timeoutMs + CLAIM_RECOVERY_DELAY_BUFFER_MS
  }

  return Math.max(
    parsedClaimStartedAt + timeoutMs + CLAIM_RECOVERY_DELAY_BUFFER_MS - Date.now(),
    0
  )
}

function getClaimRecoveryDelayMs({
  waitForPdf = false,
  waitForWhatsapp = false,
  latestState
} = {}) {
  const stageDelays = [
    waitForPdf
      ? getRemainingClaimDelayMs(latestState?.pdf_processing_started_at, PDF_STAGE_CLAIM_TIMEOUT_MS)
      : 0,
    waitForWhatsapp
      ? getRemainingClaimDelayMs(latestState?.whatsapp_processing_started_at, WHATSAPP_STAGE_CLAIM_TIMEOUT_MS)
      : 0
  ]

  return Math.max(...stageDelays, 0)
}

async function runClaimRecoveryInline({
  args,
  paymentId,
  orderId,
  logLabel,
  actor,
  waitForPdf,
  waitForWhatsapp,
  latestState,
  recoveryAttempt = 0
} = {}) {
  if ((!waitForPdf && !waitForWhatsapp) || recoveryAttempt >= MAX_CLAIM_RECOVERY_ATTEMPTS) {
    return null
  }

  const delayMs = getClaimRecoveryDelayMs({ waitForPdf, waitForWhatsapp, latestState })
  console.log(`[${logLabel}] esperando vencimiento de claim para recuperar post-pago`, {
    paymentId,
    orderId,
    waitForPdf,
    waitForWhatsapp,
    recoveryAttempt: recoveryAttempt + 1,
    delayMs
  })

  await recordProcessingEvent({
    paymentId,
    orderId,
    logLabel,
    event: 'recovery_waiting',
    actor,
    pdfProcessingOwner: latestState?.pdf_processing_owner,
    whatsappProcessingOwner: latestState?.whatsapp_processing_owner
  })

  await sleep(delayMs)

  console.log(`[${logLabel}] ejecutando recuperacion post-pago`, {
    paymentId,
    orderId,
    waitForPdf,
    waitForWhatsapp,
    recoveryAttempt: recoveryAttempt + 1
  })

  return processPaidOrderInternal({
    ...args,
    recoveryAttempt: recoveryAttempt + 1
  })
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
  whatsappApiVersion,
  recoveryAttempt = 0
} = {}) {
  const normalizedPaymentId = String(paymentId || '').trim()
  const normalizedOrderId = String(orderId || metadata?.order_id || '').trim()
  const stageErrors = []
  const processingActor = [
    logLabel,
    PROCESS_INSTANCE_LABEL || 'instance:unknown',
    randomUUID().slice(0, 8)
  ].filter(Boolean).join('|')

  let existingState = await getPaidOrderProcessingState({
    paymentId: normalizedPaymentId,
    orderId: normalizedOrderId
  })

  console.log(`[${logLabel}] inicio post-pago`, {
    paymentId: normalizedPaymentId,
    orderId: normalizedOrderId,
    source,
    actor: processingActor,
    recoveryAttempt,
    state: summarizeProcessingState(existingState)
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
    await recordProcessingEvent({
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId,
      logLabel,
      event: 'persisted',
      actor: processingActor
    })
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

  let whatsappSkippedByClaim = false
  async function attemptWhatsappNotification() {
    const shouldAttemptWhatsapp = !existingState?.whatsapp_sent_at

    if (!shouldAttemptWhatsapp) {
      console.log(`[${logLabel}] WhatsApp ya enviado previamente, omitiendo duplicado`, {
        paymentId: normalizedPaymentId
      })
      return
    }

    let whatsappClaimed = true
    try {
      const claimResult = await claimPaidOrderProcessingStage({
        paymentId: normalizedPaymentId,
        orderId: normalizedOrderId,
        stage: 'whatsapp',
        claimTimeoutMs: WHATSAPP_STAGE_CLAIM_TIMEOUT_MS,
        processingOwner: processingActor,
        processingEvent: 'whatsapp_sending'
      })
      whatsappClaimed = Boolean(claimResult.claimed)
      if (claimResult.row) {
        existingState = claimResult.row
      }
      console.log(`[${logLabel}] resultado claim WhatsApp`, {
        paymentId: normalizedPaymentId,
        actor: processingActor,
        claimed: whatsappClaimed,
        state: summarizeProcessingState(claimResult.row || existingState)
      })
    } catch (error) {
      whatsappClaimed = false
      stageErrors.push(`notificacion_claim: ${error?.message || error}`)
      console.warn(`[${logLabel}] fallo tomando claim de WhatsApp:`, error?.message || error)
    }

    if (!whatsappClaimed) {
      whatsappSkippedByClaim = true
      return
    }

    if (existingState?.whatsapp_sent_at) {
      console.log(`[${logLabel}] WhatsApp ya enviado previamente, omitiendo duplicado`, {
        paymentId: normalizedPaymentId
      })
      return
    }

    try {
      console.log(`[${logLabel}] preparando envio WhatsApp`, {
        paymentId: normalizedPaymentId,
        actor: processingActor,
        hasAccessToken: Boolean(String(whatsappAccessToken || '').trim()),
        hasPhoneNumberId: Boolean(String(whatsappPhoneNumberId || '').trim()),
        hasRecipient: Boolean(String(whatsappRecipient || '').trim()),
        templateName: String(whatsappTemplateName || '').trim() || 'text',
        templateLanguage: String(whatsappTemplateLanguageCode || 'es_MX').trim(),
        apiVersion: String(whatsappApiVersion || 'v22.0').trim()
      })
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
        whatsappProcessingStartedAt: null,
        whatsappProcessingOwner: null,
        processingLastEvent: 'whatsapp_sent',
        processingLastError: null,
        processingLastActor: processingActor,
        processingUpdatedAt: new Date().toISOString()
      })
      console.log(`[${logLabel}] WhatsApp enviado`, {
        paymentId: normalizedPaymentId,
        recipient: whatsappResult?.recipient || 'unknown',
        messageId: whatsappResult?.responsePayload?.messages?.[0]?.id || 'unknown',
        actor: processingActor
      })
    } catch (error) {
      stageErrors.push(`notificacion: ${error?.message || error}`)
      console.warn(`[${logLabel}] fallo enviando WhatsApp:`, error?.message || error)
      try {
        await updatePaidOrderProcessingState({
          paymentId: normalizedPaymentId,
          orderId: normalizedOrderId,
          whatsappProcessingStartedAt: null,
          whatsappProcessingOwner: null,
          processingLastEvent: 'whatsapp_failed',
          processingLastError: formatErrorMessage(error),
          processingLastActor: processingActor,
          processingUpdatedAt: new Date().toISOString()
        })
      } catch (clearError) {
        console.warn(`[${logLabel}] fallo liberando claim de WhatsApp:`, clearError?.message || clearError)
      }
    }
  }

  await attemptWhatsappNotification()

  try {
    const freshState = await getPaidOrderProcessingState({
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId
    })
    if (freshState) existingState = freshState
  } catch {
    // keep previous state
  }

  let pdfSkippedByClaim = false
  if (!existingState?.pdf_generated_at) {
    let pdfClaimed = true
    try {
      const claimResult = await claimPaidOrderProcessingStage({
        paymentId: normalizedPaymentId,
        orderId: normalizedOrderId,
        stage: 'pdf',
        claimTimeoutMs: PDF_STAGE_CLAIM_TIMEOUT_MS,
        processingOwner: processingActor,
        processingEvent: 'pdf_generating'
      })
      pdfClaimed = Boolean(claimResult.claimed)
      if (claimResult.row) {
        existingState = claimResult.row
      }
      console.log(`[${logLabel}] resultado claim PDF`, {
        paymentId: normalizedPaymentId,
        actor: processingActor,
        claimed: pdfClaimed,
        state: summarizeProcessingState(claimResult.row || existingState)
      })
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
      console.log(`[${logLabel}] iniciando generacion PDF`, {
        paymentId: normalizedPaymentId,
        actor: processingActor
      })
      const pdfResult = await createReceiptPdf()
      await updatePaidOrderProcessingState({
        paymentId: normalizedPaymentId,
        orderId: normalizedOrderId,
        pdfPath: pdfResult.filePath,
        pdfGeneratedAt: new Date().toISOString(),
        pdfProcessingStartedAt: null,
        pdfProcessingOwner: null,
        processingLastEvent: 'pdf_generated',
        processingLastError: null,
        processingLastActor: processingActor,
        processingUpdatedAt: new Date().toISOString()
      })
      console.log(`[${logLabel}] PDF generado`, {
        paymentId: normalizedPaymentId,
        filePath: pdfResult.filePath,
        storageProvider: pdfResult.storageProvider || 'unknown',
        actor: processingActor
      })
    } catch (error) {
      stageErrors.push(`pdf: ${error?.message || error}`)
      console.warn(`[${logLabel}] fallo generando PDF:`, error?.message || error)
      try {
        await updatePaidOrderProcessingState({
          paymentId: normalizedPaymentId,
          orderId: normalizedOrderId,
          pdfProcessingStartedAt: null,
          pdfProcessingOwner: null,
          processingLastEvent: 'pdf_failed',
          processingLastError: formatErrorMessage(error),
          processingLastActor: processingActor,
          processingUpdatedAt: new Date().toISOString()
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

  if (pdfSkippedByClaim || whatsappSkippedByClaim) {
    console.log(`[${logLabel}] esperando a que otra instancia termine el post-pago`, {
      paymentId: normalizedPaymentId,
      waitForPdf: pdfSkippedByClaim && !existingState?.pdf_generated_at,
      waitForWhatsapp: whatsappSkippedByClaim && !existingState?.whatsapp_sent_at,
      actor: processingActor,
      state: summarizeProcessingState(existingState)
    })

    await recordProcessingEvent({
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId,
      logLabel,
      event: 'waiting_for_other_instance',
      actor: processingActor,
      pdfProcessingOwner: existingState?.pdf_processing_owner,
      whatsappProcessingOwner: existingState?.whatsapp_processing_owner
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

  if (hasOnlyClaimInProgressWarnings(stageErrors)) {
    const recoveryResult = await runClaimRecoveryInline({
      args: {
        amountMxn,
        customerName,
        customerPhone,
        metadata,
        paidAt,
        paymentId: normalizedPaymentId,
        orderId: normalizedOrderId,
        source,
        createReceiptPdf,
        logLabel,
        whatsappAccessToken,
        whatsappPhoneNumberId,
        whatsappRecipient,
        whatsappTemplateName,
        whatsappTemplateLanguageCode,
        whatsappApiVersion
      },
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId,
      logLabel,
      actor: processingActor,
      waitForPdf: pdfSkippedByClaim && !existingState?.pdf_generated_at,
      waitForWhatsapp: whatsappSkippedByClaim && !existingState?.whatsapp_sent_at,
      latestState: existingState,
      recoveryAttempt
    })

    if (recoveryResult) {
      return recoveryResult
    }
  }

  if (stageErrors.length === 0) {
    await recordProcessingEvent({
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId,
      logLabel,
      event: 'completed',
      actor: processingActor
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
