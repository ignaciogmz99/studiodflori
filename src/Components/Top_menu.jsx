import { forwardRef, useEffect, useMemo, useState } from 'react'
import DatePicker from 'react-datepicker'
import { es } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'
import './Top_menu.css'
import { useCart } from '../context/CartContext'
import { DELIVERY_CITIES } from '../constants/deliveryCities'

const OPEN_HOUR = 10
const CLOSE_HOUR = 19
const SLOT_MINUTES = 30
const MIN_LEAD_HOURS = 3

function formatDeliveryDate(dateValue) {
  if (!dateValue) {
    return 'Seleccionar fecha'
  }

  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(dateValue)
}

function resolveEarliestDate(preparationHours) {
  const safeHours = Number.isFinite(preparationHours) && preparationHours > 0
    ? Math.max(preparationHours, MIN_LEAD_HOURS)
    : MIN_LEAD_HOURS
  const now = new Date()
  const earliest = new Date(now.getTime() + (safeHours * 60 * 60 * 1000))
  return earliest
}

function startOfDay(dateValue) {
  const nextDate = new Date(dateValue)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}

function isSunday(dateValue) {
  return new Date(dateValue).getDay() === 0
}

function formatSlot(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatISODate(dateValue) {
  const year = dateValue.getFullYear()
  const month = String(dateValue.getMonth() + 1).padStart(2, '0')
  const day = String(dateValue.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildTimeSlots(selectedDate, earliestDateTime) {
  if (!selectedDate || isSunday(selectedDate)) {
    return []
  }

  const date = startOfDay(selectedDate)
  const isEarliestDay = startOfDay(earliestDateTime).getTime() === date.getTime()
  const earliestMinutes = (earliestDateTime.getHours() * 60) + earliestDateTime.getMinutes()
  const minAllowedMinutes = isEarliestDay
    ? Math.max(OPEN_HOUR * 60, Math.ceil(earliestMinutes / SLOT_MINUTES) * SLOT_MINUTES)
    : OPEN_HOUR * 60
  const endMinutes = CLOSE_HOUR * 60
  const slots = []

  for (let minutes = OPEN_HOUR * 60; minutes <= endMinutes; minutes += SLOT_MINUTES) {
    slots.push({
      value: formatSlot(minutes),
      disabled: minutes < minAllowedMinutes
    })
  }

  return slots
}

function findNextAvailableDate(baseDate, earliestDateTime) {
  let date = startOfDay(baseDate)

  for (let i = 0; i < 30; i += 1) {
    const slots = buildTimeSlots(date, earliestDateTime)
    const hasEnabledSlot = slots.some((slot) => !slot.disabled)

    if (!isSunday(date) && hasEnabledSlot) {
      return date
    }

    date = new Date(date)
    date.setDate(date.getDate() + 1)
    date = startOfDay(date)
  }

  return date
}

function hasEnabledSlots(date, earliestDateTime) {
  if (isSunday(date)) {
    return false
  }

  return buildTimeSlots(date, earliestDateTime).some((slot) => !slot.disabled)
}

const DateTrigger = forwardRef(function DateTrigger({ value, onClick }, ref) {
  return (
    <button
      type="button"
      className="top-menu__date-trigger"
      onClick={onClick}
      ref={ref}
      aria-label="Elegir fecha de entrega"
    >
      {value || 'Seleccionar fecha'}
    </button>
  )
})

function TopMenu() {
  const {
    estimatedPreparationHours,
    setSelectedDeliveryDate,
    setSelectedDeliveryTime,
    selectedDeliveryCity,
    setSelectedDeliveryCity
  } = useCart()
  const earliestDeliveryDateTime = useMemo(
    () => resolveEarliestDate(estimatedPreparationHours),
    [estimatedPreparationHours]
  )
  const minDeliveryDate = useMemo(
    () => startOfDay(earliestDeliveryDateTime),
    [earliestDeliveryDateTime]
  )
  const initialDate = useMemo(
    () => findNextAvailableDate(minDeliveryDate, earliestDeliveryDateTime),
    [earliestDeliveryDateTime, minDeliveryDate]
  )
  const [deliveryDate, setDeliveryDate] = useState(() => initialDate)
  const [deliveryTime, setDeliveryTime] = useState('')
  const effectiveDeliveryDate = useMemo(() => {
    const candidateDate = deliveryDate && deliveryDate >= minDeliveryDate
      ? startOfDay(deliveryDate)
      : minDeliveryDate

    return findNextAvailableDate(candidateDate, earliestDeliveryDateTime)
  }, [deliveryDate, earliestDeliveryDateTime, minDeliveryDate])
  const availableTimeSlots = useMemo(() => (
    buildTimeSlots(effectiveDeliveryDate, earliestDeliveryDateTime)
  ), [effectiveDeliveryDate, earliestDeliveryDateTime])
  const firstEnabledTime = availableTimeSlots.find((slot) => !slot.disabled)?.value ?? ''
  const selectedTimeIsEnabled = availableTimeSlots.some(
    (slot) => slot.value === deliveryTime && !slot.disabled
  )
  const effectiveDeliveryTime = selectedTimeIsEnabled ? deliveryTime : firstEnabledTime

  useEffect(() => {
    setSelectedDeliveryDate(formatISODate(effectiveDeliveryDate))
    setSelectedDeliveryTime(effectiveDeliveryTime)
  }, [effectiveDeliveryDate, effectiveDeliveryTime, setSelectedDeliveryDate, setSelectedDeliveryTime])

  return (
    <section className="top-menu" aria-label="Destino de entrega">
      <h2 className="top-menu__title">Enviar a:</h2>

      <div className="top-menu__field top-menu__field--city" aria-label="Seleccionar ciudad de entrega">
        <span className="top-menu__icon" aria-hidden="true">
        </span>
        <select
          className="top-menu__city-select"
          value={selectedDeliveryCity}
          onChange={(event) => setSelectedDeliveryCity(event.target.value)}
          aria-label="Elegir ciudad de entrega"
        >
          {DELIVERY_CITIES.map((city) => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
      </div>

      <div className="top-menu__field top-menu__field--date" aria-label="Seleccionar fecha de entrega">
        <span className="top-menu__icon" aria-hidden="true" />
        <DatePicker
          selected={effectiveDeliveryDate}
          onChange={(date) => setDeliveryDate(date || minDeliveryDate)}
          minDate={minDeliveryDate}
          filterDate={(date) => hasEnabledSlots(date, earliestDeliveryDateTime)}
          locale={es}
          dateFormat="EEEE d 'de' MMMM"
          popperPlacement="bottom-start"
          calendarClassName="top-menu__calendar"
          customInput={<DateTrigger />}
          placeholderText={formatDeliveryDate(effectiveDeliveryDate)}
        />
      </div>

      <div className="top-menu__field top-menu__field--time" aria-label="Seleccionar horario de entrega">
        <span className="top-menu__icon" aria-hidden="true" />
        <select
          className="top-menu__time-select"
          value={effectiveDeliveryTime}
          onChange={(event) => setDeliveryTime(event.target.value)}
          aria-label="Elegir horario de entrega"
        >
          {availableTimeSlots.map((timeSlot) => (
            <option key={timeSlot.value} value={timeSlot.value} disabled={timeSlot.disabled}>
              {timeSlot.value}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}

export default TopMenu
