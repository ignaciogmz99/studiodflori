import { Component } from 'react'

class PaymentProviderBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Error inesperado en el metodo de pago.'
    }
  }

  componentDidCatch(error) {
    console.error('Payment provider render error:', error)
  }

  componentDidUpdate(prevProps) {
    if (prevProps.providerKey !== this.props.providerKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <p className="tarjeta__error">
          Ocurrio un error al cargar este metodo de pago: {this.state.errorMessage}
        </p>
      )
    }

    return this.props.children
  }
}

export default PaymentProviderBoundary
