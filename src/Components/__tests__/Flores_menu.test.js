import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatProductName,
  normalizeFlowerType,
  formatFlowerTypeLabel,
  resolvePreparationHours,
  getPreparationLabel,
} from '../Flores_menu.jsx'

// Flores_menu.jsx usa import.meta.glob para cargar imágenes — lo mockeamos
vi.mock('../Flores_menu.jsx', async (importOriginal) => {
  // Sólo re-exportamos las funciones puras; el resto del módulo lo ignoramos
  const actual = await importOriginal()
  return actual
})

// El módulo usa supabase y CartContext al nivel de módulo; los mockeamos antes de importar
vi.mock('../../lib/supabaseClient', () => ({ supabase: null }))
vi.mock('../../context/CartContext', () => ({
  useCart: () => ({
    addToCart: vi.fn(),
    setSelectedFlower: vi.fn(),
    selectedFlowerType: 'all',
    setFlowerTypeTabs: vi.fn(),
  }),
}))

// import.meta.glob no existe en Vitest — lo simulamos como objeto vacío
vi.stubGlobal('import', { meta: { glob: () => ({}) } })

// ─────────────────────────────────────────────
// formatProductName
// ─────────────────────────────────────────────
describe('formatProductName', () => {
  it('reemplaza guiones bajos con espacios', () => {
    expect(formatProductName('Bouquet_Fiusha')).toBe('Bouquet Fiusha')
  })

  it('convierte números a números romanos conocidos', () => {
    expect(formatProductName('Milan_2')).toBe('Milan II')
    expect(formatProductName('Producto_1')).toBe('Producto I')
    expect(formatProductName('Serie_10')).toBe('Serie X')
  })

  it('no altera palabras sin número', () => {
    expect(formatProductName('Kira')).toBe('Kira')
  })

  it('maneja valores falsy sin romper', () => {
    expect(formatProductName(null)).toBe('')
    expect(formatProductName(undefined)).toBe('')
    expect(formatProductName('')).toBe('')
  })

  it('colapsa espacios múltiples', () => {
    expect(formatProductName('Bouquet  Salmon')).toBe('Bouquet Salmon')
  })
})

// ─────────────────────────────────────────────
// normalizeFlowerType
// ─────────────────────────────────────────────
describe('normalizeFlowerType', () => {
  it('convierte a minúsculas y elimina espacios extremos', () => {
    expect(normalizeFlowerType('  Rosas  ')).toBe('rosas')
    expect(normalizeFlowerType('GIRASOLES')).toBe('girasoles')
  })

  it('maneja valores falsy', () => {
    expect(normalizeFlowerType(null)).toBe('')
    expect(normalizeFlowerType(undefined)).toBe('')
  })
})

// ─────────────────────────────────────────────
// formatFlowerTypeLabel
// ─────────────────────────────────────────────
describe('formatFlowerTypeLabel', () => {
  it('retorna "Ver todo" para el filtro all', () => {
    expect(formatFlowerTypeLabel('all')).toBe('Ver todo')
  })

  it('capitaliza cada palabra', () => {
    expect(formatFlowerTypeLabel('rosas rojas')).toBe('Rosas Rojas')
    expect(formatFlowerTypeLabel('girasol')).toBe('Girasol')
  })

  it('maneja separadores guión y guión bajo', () => {
    expect(formatFlowerTypeLabel('rosas-rojas')).toBe('Rosas Rojas')
    expect(formatFlowerTypeLabel('arreglo_lilis')).toBe('Arreglo Lilis')
  })

  it('retorna cadena vacía para valores falsy', () => {
    expect(formatFlowerTypeLabel(null)).toBe('')
    expect(formatFlowerTypeLabel('')).toBe('')
  })
})

// ─────────────────────────────────────────────
// resolvePreparationHours
// ─────────────────────────────────────────────
describe('resolvePreparationHours', () => {
  it('retorna 24 si inventory es null o undefined', () => {
    expect(resolvePreparationHours(null)).toBe(24)
    expect(resolvePreparationHours(undefined)).toBe(24)
  })

  it('usa tiempo_preparacion_horas si está presente', () => {
    expect(resolvePreparationHours({ tiempo_preparacion_horas: 4 })).toBe(4)
  })

  it('usa preparacion_horas como alternativa', () => {
    expect(resolvePreparationHours({ preparacion_horas: 6 })).toBe(6)
  })

  it('usa preparation_hours como alternativa final de horas', () => {
    expect(resolvePreparationHours({ preparation_hours: 8 })).toBe(8)
  })

  it('convierte días a horas cuando no hay campo de horas', () => {
    expect(resolvePreparationHours({ tiempo_preparacion_dias: 2 })).toBe(48)
    expect(resolvePreparationHours({ preparacion_dias: 1 })).toBe(24)
    expect(resolvePreparationHours({ preparation_days: 3 })).toBe(72)
  })

  it('retorna 24 si los valores son 0 o negativos', () => {
    expect(resolvePreparationHours({ tiempo_preparacion_horas: 0 })).toBe(24)
    expect(resolvePreparationHours({ tiempo_preparacion_horas: -5 })).toBe(24)
  })

  it('las horas tienen prioridad sobre los días', () => {
    expect(resolvePreparationHours({ tiempo_preparacion_horas: 4, tiempo_preparacion_dias: 3 })).toBe(4)
  })
})

// ─────────────────────────────────────────────
// getPreparationLabel
// ─────────────────────────────────────────────
describe('getPreparationLabel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna "Hoy sale" dentro del horario cuando el producto está listo hoy', () => {
    // Miércoles 2026-03-25 a las 11:00 AM
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T11:00:00'))
    expect(getPreparationLabel(4)).toBe('Hoy sale')
  })

  it('retorna "Mañana a primera hora" cuando no alcanza el mismo día', () => {
    // Miércoles 2026-03-25 a las 18:00 (sólo 1 hora antes del cierre — no alcanza con 4h)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T18:00:00'))
    expect(getPreparationLabel(4)).toBe('Mañana a primera hora')
  })

  it('retorna "Lunes a primera hora" cuando mañana es domingo', () => {
    // Sábado 2026-03-28 — mañana es domingo
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T12:00:00'))
    expect(getPreparationLabel(48)).toBe('Lunes a primera hora')
  })

  it('usa 24h por defecto para valores inválidos', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T12:00:00'))
    // Con 24h nunca cae en "Hoy sale"
    const result = getPreparationLabel(null)
    expect(['Mañana a primera hora', 'Lunes a primera hora']).toContain(result)
  })
})
