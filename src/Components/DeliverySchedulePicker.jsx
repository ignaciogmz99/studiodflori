import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import DatePicker from 'react-datepicker'
import { es } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'
import './DeliverySchedulePicker.css'
import { useCart } from '../context/CartContext'
import { DELIVERY_CITIES } from '../constants/deliveryCities'
import { isMothersDayCatalogLocked, isSundayDeliveryBlocked } from '../lib/mothersDayCatalog'
import { isDeliveryDateBlocked } from '../lib/deliveryAvailability'

const OPEN_HOUR = 10
const CLOSE_HOUR = 19
const SLOT_MINUTES = 30
const MOTHERS_DAY_LOCKED_WARNING = 'Los dias 7 al 10 de mayo son exclusivos para el catalogo del Dia de las Madres.'

function startOfDay(d) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function formatSlot(totalMinutes) {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatISODate(d) {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

function isBlockedMothersDayDate(dateValue, canScheduleLockedMothersDayDates) {
  return !canScheduleLockedMothersDayDates && isMothersDayCatalogLocked(dateValue)
}

function resolveEarliestDateTime() {
  const now = new Date()
  const earliest = new Date(now)
  earliest.setDate(earliest.getDate() + 1)
  earliest.setHours(OPEN_HOUR, 0, 0, 0)
  while (isSundayDeliveryBlocked(earliest)) {
    earliest.setDate(earliest.getDate() + 1)
    earliest.setHours(OPEN_HOUR, 0, 0, 0)
  }
  return earliest
}

function buildTimeSlots(selectedDate, earliestDateTime, canScheduleLockedMothersDayDates = true) {
  if (!selectedDate || isSundayDeliveryBlocked(selectedDate) || isDeliveryDateBlocked(selectedDate) || isBlockedMothersDayDate(selectedDate, canScheduleLockedMothersDayDates)) return []
  const date = startOfDay(selectedDate)
  const isEarliestDay = startOfDay(earliestDateTime).getTime() === date.getTime()
  const earliestMinutes = (earliestDateTime.getHours() * 60) + earliestDateTime.getMinutes()
  const minAllowedMinutes = isEarliestDay
    ? Math.max(OPEN_HOUR * 60, Math.ceil(earliestMinutes / SLOT_MINUTES) * SLOT_MINUTES)
    : OPEN_HOUR * 60
  const slots = []
  for (let minutes = OPEN_HOUR * 60; minutes <= CLOSE_HOUR * 60; minutes += SLOT_MINUTES) {
    slots.push({ value: formatSlot(minutes), disabled: minutes < minAllowedMinutes })
  }
  return slots
}

function findNextAvailableDate(baseDate, earliestDateTime, canScheduleLockedMothersDayDates = true) {
  let date = startOfDay(baseDate)
  for (let i = 0; i < 30; i++) {
    if (!isSundayDeliveryBlocked(date) && buildTimeSlots(date, earliestDateTime, canScheduleLockedMothersDayDates).some((s) => !s.disabled)) return date
    date = new Date(date)
    date.setDate(date.getDate() + 1)
    date = startOfDay(date)
  }
  return date
}

function hasEnabledSlots(date, earliestDateTime, canScheduleLockedMothersDayDates = true) {
  if (isSundayDeliveryBlocked(date) || isDeliveryDateBlocked(date) || isBlockedMothersDayDate(date, canScheduleLockedMothersDayDates)) return false
  return buildTimeSlots(date, earliestDateTime, canScheduleLockedMothersDayDates).some((s) => !s.disabled)
}

const DateTrigger = forwardRef(function DateTrigger({ value, onClick }, ref) {
  return (
    <button
      type="button"
      className="dsp__control dsp__control--btn"
      onClick={onClick}
      ref={ref}
      aria-label="Elegir fecha de entrega"
    >
      {value || 'Seleccionar fecha'}
    </button>
  )
})

function TimeSelect({ slots, value, onChange }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const enabledSlots = slots.filter((s) => !s.disabled)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="dsp__time" ref={wrapRef}>
      <button
        type="button"
        className="dsp__control dsp__control--btn dsp__control--arrow"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {value || enabledSlots[0]?.value || '—'}
      </button>
      {open && (
        <ul className="dsp__time-list" role="listbox" aria-label="Horario de entrega">
          {enabledSlots.map((s) => (
            <li key={s.value} role="option" aria-selected={s.value === value}>
              <button
                type="button"
                className={`dsp__time-option${s.value === value ? ' dsp__time-option--active' : ''}`}
                onClick={() => { onChange(s.value); setOpen(false) }}
              >
                {s.value}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DeliverySchedulePicker({ showCity = false }) {
  const {
    selectedDeliveryDate,
    setSelectedDeliveryDate,
    setSelectedDeliveryTime,
    selectedDeliveryCity,
    setSelectedDeliveryCity,
    canScheduleLockedMothersDayDates
  } = useCart()

  const earliestDeliveryDateTime = useMemo(() => resolveEarliestDateTime(), [])
  const minDeliveryDate = useMemo(() => startOfDay(earliestDeliveryDateTime), [earliestDeliveryDateTime])

  const [deliveryDate, setDeliveryDate] = useState(() => {
    const earliest = resolveEarliestDateTime()
    const minDate = startOfDay(earliest)
    if (selectedDeliveryDate) {
      const fromCtx = new Date(`${selectedDeliveryDate}T00:00:00`)
      if (fromCtx >= minDate) return findNextAvailableDate(fromCtx, earliest, canScheduleLockedMothersDayDates)
    }
    return findNextAvailableDate(minDate, earliest, canScheduleLockedMothersDayDates)
  })
  const [deliveryTime, setDeliveryTime] = useState('')
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth <= 560 : false
  )

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 560)
    handler()
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const effectiveDeliveryDate = useMemo(() => {
    const candidate = deliveryDate && deliveryDate >= minDeliveryDate
      ? startOfDay(deliveryDate)
      : minDeliveryDate
    return findNextAvailableDate(candidate, earliestDeliveryDateTime, canScheduleLockedMothersDayDates)
  }, [canScheduleLockedMothersDayDates, deliveryDate, earliestDeliveryDateTime, minDeliveryDate])

  const availableTimeSlots = useMemo(
    () => buildTimeSlots(effectiveDeliveryDate, earliestDeliveryDateTime, canScheduleLockedMothersDayDates),
    [canScheduleLockedMothersDayDates, effectiveDeliveryDate, earliestDeliveryDateTime]
  )
  const firstEnabledTime = availableTimeSlots.find((s) => !s.disabled)?.value ?? ''
  const selectedTimeIsEnabled = availableTimeSlots.some(
    (s) => s.value === deliveryTime && !s.disabled
  )
  const effectiveDeliveryTime = selectedTimeIsEnabled ? deliveryTime : firstEnabledTime

  useEffect(() => {
    setSelectedDeliveryDate(formatISODate(effectiveDeliveryDate))
    setSelectedDeliveryTime(effectiveDeliveryTime)
  }, [effectiveDeliveryDate, effectiveDeliveryTime, setSelectedDeliveryDate, setSelectedDeliveryTime])

  return (
    <div className={`dsp ${showCity ? 'dsp--three' : 'dsp--two'}`}>
      {showCity && (
        <div className="dsp__field">
          <span className="dsp__field-label">Ciudad</span>
          <TimeSelect
            slots={DELIVERY_CITIES.map((city) => ({ value: city, disabled: false }))}
            value={selectedDeliveryCity}
            onChange={setSelectedDeliveryCity}
          />
        </div>
      )}

      <div className="dsp__field">
        <span className="dsp__field-label">Fecha de entrega</span>
        <DatePicker
          selected={effectiveDeliveryDate}
          onChange={(date) => setDeliveryDate(date || minDeliveryDate)}
          minDate={minDeliveryDate}
          filterDate={(date) => hasEnabledSlots(date, earliestDeliveryDateTime, canScheduleLockedMothersDayDates)}
          locale={es}
          dateFormat="EEEE d 'de' MMMM"
          popperPlacement="bottom-start"
          portalId="root"
          calendarClassName="dsp__calendar"
          customInput={<DateTrigger />}
          withPortal={isMobile}
        />
        {!canScheduleLockedMothersDayDates && (
          <p className="dsp__field-help">{MOTHERS_DAY_LOCKED_WARNING}</p>
        )}
      </div>

      <div className="dsp__field">
        <span className="dsp__field-label">Horario</span>
        <TimeSelect
          slots={availableTimeSlots}
          value={effectiveDeliveryTime}
          onChange={setDeliveryTime}
        />
      </div>
    </div>
  )
}

export default DeliverySchedulePicker
export { TimeSelect }
