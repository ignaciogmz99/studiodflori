import { useMemo, useState } from 'react'
import DatePicker from 'react-datepicker'
import { es } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'
import './Top_menu.css'

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

function TopMenu() {
  const today = useMemo(() => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date
  }, [])
  const [deliveryDate, setDeliveryDate] = useState(today)

  return (
    <section className="top-menu" aria-label="Destino de entrega">
      <h2 className="top-menu__title">Enviar a:</h2>

      <button type="button" className="top-menu__field" aria-label="Seleccionar ciudad de entrega">
        <span className="top-menu__icon" aria-hidden="true">
        </span>
        <span className="top-menu__text">Guadalajara</span>
      </button>

      <div className="top-menu__field top-menu__field--date" aria-label="Seleccionar fecha de entrega">
        <span className="top-menu__icon" aria-hidden="true" />
        <DatePicker
          selected={deliveryDate}
          onChange={(date) => setDeliveryDate(date || today)}
          minDate={today}
          locale={es}
          dateFormat="EEEE d 'de' MMMM"
          popperPlacement="bottom-start"
          calendarClassName="top-menu__calendar"
          customInput={<button type="button" className="top-menu__date-trigger">{formatDeliveryDate(deliveryDate)}</button>}
        />
      </div>
    </section>
  )
}

export default TopMenu
