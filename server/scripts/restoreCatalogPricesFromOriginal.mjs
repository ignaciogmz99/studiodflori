import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { PROMO_PRODUCT_IDS } from '../../src/constants/promoProducts.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')

dotenv.config({ path: path.join(repoRoot, 'server', '.env') })

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim()
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en server/.env')
}

const EXCLUDED_IDS = new Set([
  'Longiflorum',
  ...PROMO_PRODUCT_IDS
])

const shouldApply = process.argv.includes('--apply')
const backupStamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupDir = path.join(repoRoot, 'local_tools', 'price_backups')
const backupPath = path.join(backupDir, `restore-hot-sale-${backupStamp}.json`)

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})

function asNumber(value) {
  if (value == null || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function shouldRestoreProduct(row) {
  const currentPrice = asNumber(row?.precio)
  const originalPrice = asNumber(row?.precio_original)

  return Boolean(row?.id)
    && !EXCLUDED_IDS.has(row.id)
    && currentPrice !== null
    && originalPrice !== null
    && currentPrice !== originalPrice
}

async function fetchCatalogRows() {
  const { data, error } = await supabase
    .from('productos')
    .select('id,precio,precio_original,activo')
    .order('id')

  if (error) {
    throw new Error(`No se pudo leer productos desde Supabase: ${error.message}`)
  }

  return data || []
}

async function writeBackup(rows) {
  await fs.mkdir(backupDir, { recursive: true })
  await fs.writeFile(
    backupPath,
    JSON.stringify({
      backedUpAt: new Date().toISOString(),
      excludedIds: [...EXCLUDED_IDS].sort(),
      rows
    }, null, 2),
    'utf8'
  )
}

async function restorePrices(rowsToRestore) {
  const updated = []

  for (const row of rowsToRestore) {
    const { data, error } = await supabase
      .from('productos')
      .update({ precio: row.precio_original })
      .eq('id', row.id)
      .select('id,precio,precio_original')
      .single()

    if (error) {
      throw new Error(`No se pudo restaurar ${row.id}: ${error.message}`)
    }

    updated.push(data)
  }

  return updated
}

async function main() {
  const rows = await fetchCatalogRows()
  const excludedRows = rows.filter((row) => EXCLUDED_IDS.has(row.id))
  const rowsToRestore = rows.filter(shouldRestoreProduct)

  await writeBackup(rows)

  console.log(`Respaldo guardado en: ${backupPath}`)
  console.log(`Productos excluidos manualmente: ${excludedRows.map((row) => row.id).sort().join(', ')}`)
  console.log(`Productos candidatos a restaurar: ${rowsToRestore.length}`)

  if (!shouldApply) {
    console.log('Modo simulacion. Ejecuta con --apply para restaurar los precios.')
    return
  }

  const updatedRows = await restorePrices(rowsToRestore)
  const invalidRows = updatedRows.filter((row) => asNumber(row.precio) !== asNumber(row.precio_original))

  if (invalidRows.length > 0) {
    throw new Error(`La verificacion fallo para: ${invalidRows.map((row) => row.id).join(', ')}`)
  }

  console.log(`Productos restaurados: ${updatedRows.length}`)
  console.log(updatedRows.map((row) => `${row.id}: ${row.precio}`).join('\n'))
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
