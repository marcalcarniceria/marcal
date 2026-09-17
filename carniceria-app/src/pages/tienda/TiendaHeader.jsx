import { Link } from 'react-router-dom'
import { useCarrito } from './CarritoContext'

export function TiendaHeader() {
  const { cantidadTotal } = useCarrito()

  return (
    <header className="tienda-header">
      <Link to="/tienda" className="tienda-logo">
        <span className="tienda-logo-marca">M</span>
        <span className="tienda-logo-texto">
          Mar-Cal
          <small>Carnicería y Verdulería</small>
        </span>
      </Link>
      <nav>
        <Link to="/tienda/carrito" className="tienda-carrito-link" data-cantidad={cantidadTotal}>
          Carrito ({cantidadTotal})
        </Link>
      </nav>
    </header>
  )
}
