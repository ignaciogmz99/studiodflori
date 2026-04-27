import { describe, expect, it } from 'vitest'
import { DIA_MADRES_FILTER_KEY } from '../constants/promoProducts'
import {
  allowsMothersDaySundayDelivery,
  cartSupportsLockedMothersDayDates,
  isLockedMothersDayDateBlockedForCart,
  isMothersDayCatalogLocked,
  isMothersDayCatalogSeason,
  isMothersDayProductId,
  isSundayDeliveryBlocked,
  resolveInitialFlowerType
} from './mothersDayCatalog'

describe('mothersDayCatalog', () => {
  it('activa el catalogo del Dia de las Madres del 1 al 10 de mayo', () => {
    expect(isMothersDayCatalogSeason('2026-05-01')).toBe(true)
    expect(isMothersDayCatalogSeason('2026-05-10')).toBe(true)
    expect(isMothersDayCatalogSeason('2026-05-11')).toBe(false)
    expect(isMothersDayCatalogSeason('2026-04-30')).toBe(false)
  })

  it('bloquea el catalogo del 7 al 10 de mayo', () => {
    expect(isMothersDayCatalogLocked('2026-05-06')).toBe(false)
    expect(isMothersDayCatalogLocked('2026-05-07')).toBe(true)
    expect(isMothersDayCatalogLocked('2026-05-10')).toBe(true)
    expect(isMothersDayCatalogLocked('2026-05-11')).toBe(false)
  })

  it('usa Dia de las Madres como filtro inicial durante la temporada', () => {
    expect(resolveInitialFlowerType('2026-05-03')).toBe(DIA_MADRES_FILTER_KEY)
    expect(resolveInitialFlowerType('2026-06-03')).toBe('all')
  })

  it('detecta productos validos para las fechas bloqueadas del Dia de las Madres', () => {
    expect(isMothersDayProductId('DM_Tulipanes')).toBe(true)
    expect(isMothersDayProductId('Bouquet_rosas')).toBe(false)
  })

  it('solo permite fechas bloqueadas cuando todo el carrito es del catalogo del Dia de las Madres', () => {
    expect(cartSupportsLockedMothersDayDates([])).toBe(true)
    expect(cartSupportsLockedMothersDayDates([{ id: 'DM_Tulipanes' }, { id: 'DM_Ramo_Lisianthus' }])).toBe(true)
    expect(cartSupportsLockedMothersDayDates([{ id: 'DM_Tulipanes' }, { id: 'Bouquet_rosas' }])).toBe(false)
  })

  it('bloquea el 7 al 10 de mayo para carritos con productos fuera del catalogo especial', () => {
    expect(isLockedMothersDayDateBlockedForCart('2026-05-08', [{ id: 'Bouquet_rosas' }])).toBe(true)
    expect(isLockedMothersDayDateBlockedForCart('2026-05-08', [{ id: 'DM_Tulipanes' }])).toBe(false)
    expect(isLockedMothersDayDateBlockedForCart('2026-05-12', [{ id: 'Bouquet_rosas' }])).toBe(false)
  })

  it('habilita solo el domingo 10 de mayo para entregas', () => {
    expect(allowsMothersDaySundayDelivery('2026-05-10')).toBe(true)
    expect(isSundayDeliveryBlocked('2026-05-10')).toBe(false)
    expect(isSundayDeliveryBlocked('2026-05-17')).toBe(true)
  })
})
