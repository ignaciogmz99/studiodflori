const TEMPORARY_DELIVERY_CLOSURES = Object.freeze([
  Object.freeze({ start: '2026-08-21', end: '2026-08-27' })
])

function formatLocalISODate(value) {
  if (typeof value === 'string') {
    const isoDate = value.trim().match(/^(\d{4}-\d{2}-\d{2})$/)
    if (isoDate) return isoDate[1]
  }

  const date = value instanceof Date ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isDeliveryDateBlocked(value) {
  const isoDate = formatLocalISODate(value)
  if (!isoDate) return false

  return TEMPORARY_DELIVERY_CLOSURES.some(({ start, end }) => (
    isoDate >= start && isoDate <= end
  ))
}

export function getDeliveryDateBlockedMessage() {
  return 'Las entregas del 21 al 27 de agosto no están disponibles. Elige el viernes 28 de agosto o una fecha posterior.'
}
