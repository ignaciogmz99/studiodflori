import { describe, expect, it } from 'vitest'
import {
  getDeliveryDateBlockedMessage,
  isDeliveryDateBlocked
} from './deliveryAvailability'

describe('deliveryAvailability', () => {
  it('bloquea del viernes 21 al jueves 27 de agosto de 2026, inclusive', () => {
    expect(isDeliveryDateBlocked('2026-08-21')).toBe(true)
    expect(isDeliveryDateBlocked('2026-08-24')).toBe(true)
    expect(isDeliveryDateBlocked('2026-08-27')).toBe(true)
  })

  it('mantiene disponibles las fechas alrededor del cierre temporal', () => {
    expect(isDeliveryDateBlocked('2026-08-20')).toBe(false)
    expect(isDeliveryDateBlocked('2026-08-28')).toBe(false)
  })

  it('explica cómo continuar después del cierre', () => {
    expect(getDeliveryDateBlockedMessage()).toContain('viernes 28 de agosto')
  })
})
