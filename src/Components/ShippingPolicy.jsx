function ShippingPolicy() {
  return (
    <section className="shipping-policy" id="shipping-policy" aria-label="Politicas de envio">
      <div className="shipping-policy__card">
        <h3 className="shipping-policy__title">Politica de Envio</h3>
        <p className="shipping-policy__copy">
          Sabemos lo importante que es esta fecha, por eso nos comprometemos a entregar tu regalo
          en el dia y el horario seleccionados.
        </p>

        <h4 className="shipping-policy__heading">Horarios de Entrega</h4>
        <p className="shipping-policy__copy">
          Nuestros horarios de entrega son de lunes a sabado, en linea con el calendario de
          programacion disponible en la tienda.
        </p>

        <h4 className="shipping-policy__heading">Dia de las Madres y San Valentin</h4>
        <p className="shipping-policy__copy">
          El horario de entrega es de 10:00 am a 7:00 pm. Por el volumen de pedidos, en estos dias
          no hay entregas con horario especial.
        </p>

        <h4 className="shipping-policy__heading">Reprogramaciones</h4>
        <p className="shipping-policy__copy">
          Si no se encuentra el destinatario, intentaremos comunicarnos para resolver la situacion.
          En caso de no tener respuesta, entregaremos tu pedido con alguien cercano: un vecino,
          companero de trabajo o en recepcion. Si nadie puede recibir el regalo, te notificaremos
          para reprogramar el envio. Tendras 48 horas para elegir otra fecha de entrega.
        </p>
      </div>
    </section>
  )
}

export default ShippingPolicy
