import { forwardRef, useEffect, useMemo, useState } from 'react'
import DatePicker from 'react-datepicker'
import { es } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'
import './Top_menu.css'
import { useCart } from '../context/CartContext'
import { DELIVERY_CITIES } from '../constants/deliveryCities'
import { isMothersDayCatalogLocked } from '../lib/mothersDayCatalog'
import ShippingPolicyPanel from './ShippingPolicyPanel.jsx'
import { TimeSelect } from './DeliverySchedulePicker'

const OPEN_HOUR = 10
const CLOSE_HOUR = 19
const SLOT_MINUTES = 30
const MOTHERS_DAY_LOCKED_WARNING = 'Los dias 7 al 10 de mayo son exclusivos para el catalogo del Dia de las Madres.'

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

function startOfDay(dateValue) {
  const nextDate = new Date(dateValue)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}

function resolveEarliestDate() {
  const now = new Date()
  const earliest = new Date(now)

  earliest.setDate(earliest.getDate() + 1)
  earliest.setHours(OPEN_HOUR, 0, 0, 0)

  while (isSunday(earliest)) {
    earliest.setDate(earliest.getDate() + 1)
    earliest.setHours(OPEN_HOUR, 0, 0, 0)
  }

  return earliest
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

function isBlockedMothersDayDate(dateValue, canScheduleLockedMothersDayDates) {
  return !canScheduleLockedMothersDayDates && isMothersDayCatalogLocked(dateValue)
}

function buildTimeSlots(selectedDate, earliestDateTime, canScheduleLockedMothersDayDates = true) {
  if (!selectedDate || isSunday(selectedDate) || isBlockedMothersDayDate(selectedDate, canScheduleLockedMothersDayDates)) {
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

function findNextAvailableDate(baseDate, earliestDateTime, canScheduleLockedMothersDayDates = true) {
  let date = startOfDay(baseDate)

  for (let i = 0; i < 30; i += 1) {
    const slots = buildTimeSlots(date, earliestDateTime, canScheduleLockedMothersDayDates)
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

function hasEnabledSlots(date, earliestDateTime, canScheduleLockedMothersDayDates = true) {
  if (isSunday(date) || isBlockedMothersDayDate(date, canScheduleLockedMothersDayDates)) {
    return false
  }

  return buildTimeSlots(date, earliestDateTime, canScheduleLockedMothersDayDates).some((slot) => !slot.disabled)
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
    selectedDeliveryDate,
    setSelectedDeliveryDate,
    setSelectedDeliveryTime,
    selectedDeliveryCity,
    setSelectedDeliveryCity,
    canScheduleLockedMothersDayDates
  } = useCart()
  const earliestDeliveryDateTime = useMemo(
    () => resolveEarliestDate(),
    []
  )
  const minDeliveryDate = useMemo(
    () => startOfDay(earliestDeliveryDateTime),
    [earliestDeliveryDateTime]
  )
  const initialDate = useMemo(
    () => {
      if (selectedDeliveryDate) {
        const fromContext = new Date(`${selectedDeliveryDate}T00:00:00`)
        if (fromContext >= minDeliveryDate) {
          return findNextAvailableDate(fromContext, earliestDeliveryDateTime, canScheduleLockedMothersDayDates)
        }
      }

      return findNextAvailableDate(minDeliveryDate, earliestDeliveryDateTime, canScheduleLockedMothersDayDates)
    },
    [canScheduleLockedMothersDayDates, earliestDeliveryDateTime, minDeliveryDate, selectedDeliveryDate]
  )
  const [deliveryDate, setDeliveryDate] = useState(() => initialDate)
  const [deliveryTime, setDeliveryTime] = useState('')
  const [isPolicyOpen, setIsPolicyOpen] = useState(false)
  const [isMobileDatePicker, setIsMobileDatePicker] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false
  ))
  const effectiveDeliveryDate = useMemo(() => {
    const candidateDate = deliveryDate && deliveryDate >= minDeliveryDate
      ? startOfDay(deliveryDate)
      : minDeliveryDate

    return findNextAvailableDate(candidateDate, earliestDeliveryDateTime, canScheduleLockedMothersDayDates)
  }, [canScheduleLockedMothersDayDates, deliveryDate, earliestDeliveryDateTime, minDeliveryDate])
  const availableTimeSlots = useMemo(() => (
    buildTimeSlots(effectiveDeliveryDate, earliestDeliveryDateTime, canScheduleLockedMothersDayDates)
  ), [canScheduleLockedMothersDayDates, effectiveDeliveryDate, earliestDeliveryDateTime])
  const firstEnabledTime = availableTimeSlots.find((slot) => !slot.disabled)?.value ?? ''
  const selectedTimeIsEnabled = availableTimeSlots.some(
    (slot) => slot.value === deliveryTime && !slot.disabled
  )
  const effectiveDeliveryTime = selectedTimeIsEnabled ? deliveryTime : firstEnabledTime

  useEffect(() => {
    setSelectedDeliveryDate(formatISODate(effectiveDeliveryDate))
    setSelectedDeliveryTime(effectiveDeliveryTime)
  }, [effectiveDeliveryDate, effectiveDeliveryTime, setSelectedDeliveryDate, setSelectedDeliveryTime])

  useEffect(() => {
    const handleResize = () => {
      setIsMobileDatePicker(window.innerWidth <= 560)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <section className="top-menu" aria-label="Destino de entrega">
      <div className="top-menu__intro">
        <p className="top-menu__eyebrow">Entrega programada</p>
        <h2 className="top-menu__title">
          <span className="top-menu__title-desktop">Enviar a:</span>
          <span className="top-menu__title-mobile">¿A donde quieres enviar?</span>
        </h2>
        <p className="top-menu__subtitle">Elige ciudad, fecha y horario.</p>
      </div>

      <div className="top-menu__field top-menu__field--city" aria-label="Seleccionar ciudad de entrega">
        <span className="top-menu__field-label">Ciudad</span>
        <div className="top-menu__city-wrap">
          <TimeSelect
            slots={DELIVERY_CITIES.map((city) => ({ value: city, disabled: false }))}
            value={selectedDeliveryCity}
            onChange={setSelectedDeliveryCity}
          />
        </div>
      </div>

      <div className="top-menu__field-group top-menu__field-group--date">
        <div className="top-menu__field top-menu__field--date" aria-label="Seleccionar fecha de entrega">
          <span className="top-menu__field-label">Fecha de entrega</span>
          <DatePicker
            selected={effectiveDeliveryDate}
            onChange={(date) => setDeliveryDate(date || minDeliveryDate)}
            minDate={minDeliveryDate}
            filterDate={(date) => hasEnabledSlots(date, earliestDeliveryDateTime, canScheduleLockedMothersDayDates)}
            locale={es}
            dateFormat="EEEE d 'de' MMMM"
            popperPlacement={isMobileDatePicker ? 'bottom' : 'bottom-start'}
            calendarClassName="top-menu__calendar"
            customInput={<DateTrigger />}
            placeholderText={formatDeliveryDate(effectiveDeliveryDate)}
            withPortal={isMobileDatePicker}
          />
        </div>
        {!canScheduleLockedMothersDayDates && (
          <p className="top-menu__field-help top-menu__field-help--mobile">{MOTHERS_DAY_LOCKED_WARNING}</p>
        )}
      </div>

      <div className="top-menu__field top-menu__field--time" aria-label="Seleccionar horario de entrega">
        <span className="top-menu__field-label">Horario</span>
        <div className="top-menu__time-wrap">
          <TimeSelect
            slots={availableTimeSlots}
            value={effectiveDeliveryTime}
            onChange={setDeliveryTime}
          />
        </div>
      </div>

      <div className="top-menu__actions" aria-label="Acciones de entrega">
        {!canScheduleLockedMothersDayDates && (
          <p className="top-menu__delivery-warning">{MOTHERS_DAY_LOCKED_WARNING}</p>
        )}
        <button
          type="button"
          className="top-menu__policy-button"
          onClick={() => setIsPolicyOpen(true)}
          aria-expanded={isPolicyOpen}
          aria-label="Politica de envio"
        >
          <span className="top-menu__policy-icon" aria-hidden="true">🚚</span>
          <span className="top-menu__policy-copy">
            <span className="top-menu__policy-accent">Politica de Envio.</span>
            <span className="top-menu__policy-copy-text"> Garantizamos la entrega segura y puntual de tus regalos.</span>
          </span>
        </button>
      </div>

      {isPolicyOpen && <ShippingPolicyPanel onClose={() => setIsPolicyOpen(false)} />}
    </section>
  )
}

export default TopMenu

