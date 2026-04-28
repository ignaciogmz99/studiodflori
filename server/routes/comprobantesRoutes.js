/* global Buffer, process */
import { Router } from 'express'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getPaidOrderReceiptReference } from '../services/orderPersistenceService.js'
import { getReceiptsDir } from '../services/receiptPdfService.js'

function getSupabaseStorageCredentials() {
  return {
    supabaseUrl: String(process.env.SUPABASE_URL || '').trim(),
    supabaseKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  }
}

function encodeStorageObjectUrl({ supabaseUrl, bucket, objectPath }) {
  const encodedPath = [
    encodeURIComponent(bucket),
    ...String(objectPath || '')
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
  ].join('/')

  return new URL(`/storage/v1/object/${encodedPath}`, supabaseUrl)
}

function parseSupabaseReceiptPath(filePath) {
  const match = String(filePath || '').match(/^supabase:\/\/([^/]+)\/(.+)$/)
  if (!match) {
    return null
  }

  return {
    bucket: match[1],
    objectPath: match[2]
  }
}

function buildReceiptFileName({ paymentId, filePath }) {
  const fromPath = String(filePath || '').split('/').filter(Boolean).at(-1)
  if (fromPath && fromPath.toLowerCase().endsWith('.pdf')) {
    return fromPath.replace(/["\\]/g, '')
  }

  const safePaymentId = String(paymentId || 'sin-folio').replace(/[^a-zA-Z0-9-_]/g, '') || 'sin-folio'
  return `comprobante-${safePaymentId}.pdf`
}

async function readSupabaseReceipt({ bucket, objectPath }) {
  const { supabaseUrl, supabaseKey } = getSupabaseStorageCredentials()
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase Storage no esta configurado en el servidor')
  }

  const downloadUrl = encodeStorageObjectUrl({ supabaseUrl, bucket, objectPath })
  const response = await fetch(downloadUrl.toString(), {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`No se pudo leer PDF desde Supabase Storage (${response.status}): ${details}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

async function readLocalReceipt(filePath) {
  const resolvedPath = path.resolve(String(filePath || ''))
  const generatedReceiptsDir = path.resolve(getReceiptsDir())
  const isInsideReceiptsDir =
    resolvedPath === generatedReceiptsDir ||
    resolvedPath.startsWith(`${generatedReceiptsDir}${path.sep}`)

  if (!isInsideReceiptsDir) {
    throw new Error('Ruta de comprobante local no permitida')
  }

  console.log('[comprobantes] leyendo PDF local', {
    filePath: resolvedPath,
    receiptsDir: generatedReceiptsDir
  })
  return readFile(resolvedPath)
}

async function readReceiptPdf(filePath) {
  const supabasePath = parseSupabaseReceiptPath(filePath)
  if (supabasePath) {
    return readSupabaseReceipt(supabasePath)
  }

  return readLocalReceipt(filePath)
}

export function createComprobantesRouter() {
  const router = Router()

  router.get('/:paymentId/status', async (req, res) => {
    try {
      const paymentId = String(req.params.paymentId || '').trim()
      const orderId = String(req.query.orderId || '').trim()

      if (!paymentId || !orderId) {
        return res.status(400).json({
          ready: false,
          error: 'Falta paymentId u orderId para consultar el comprobante'
        })
      }

      const receipt = await getPaidOrderReceiptReference({ paymentId, orderId })
      const ready = Boolean(receipt?.pdf_path && receipt?.pdf_generated_at)

      return res.status(ready ? 200 : 202).json({
        ready,
        paymentId,
        orderId,
        message: ready
          ? 'Comprobante listo'
          : 'El comprobante todavia se esta generando'
      })
    } catch (error) {
      console.warn('[comprobantes] fallo consultando estado:', error?.message || error)
      return res.status(500).json({
        ready: false,
        error: 'No se pudo consultar el estado del comprobante'
      })
    }
  })

  router.get('/:paymentId/pdf', async (req, res) => {
    try {
      const paymentId = String(req.params.paymentId || '').trim()
      const orderId = String(req.query.orderId || '').trim()

      if (!paymentId || !orderId) {
        return res.status(400).send('Falta paymentId u orderId para abrir el comprobante.')
      }

      const receipt = await getPaidOrderReceiptReference({ paymentId, orderId })
      if (!receipt?.pdf_path || !receipt?.pdf_generated_at) {
        return res.status(404).send('El comprobante todavia se esta generando. Intenta de nuevo en unos segundos.')
      }

      const pdfBuffer = await readReceiptPdf(receipt.pdf_path)
      const fileName = buildReceiptFileName({ paymentId, filePath: receipt.pdf_path })

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`)
      res.setHeader('Cache-Control', 'private, max-age=60')
      return res.send(pdfBuffer)
    } catch (error) {
      console.warn('[comprobantes] fallo abriendo PDF:', error?.message || error)
      return res.status(500).send('No se pudo abrir el comprobante PDF. Intenta de nuevo mas tarde.')
    }
  })

  return router
}
