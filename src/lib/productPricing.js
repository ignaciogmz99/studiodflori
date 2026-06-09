export function formatMxPrice(value) {
  if (value == null || value === '') {
    return ''
  }

  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return ''
  }

  const fractionDigits = Number.isInteger(parsedValue) ? 0 : 2

  return parsedValue.toLocaleString('es-MX', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2
  })
}
