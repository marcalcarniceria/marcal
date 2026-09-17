import { Link, useParams } from 'react-router-dom'
import { TiendaHeader } from './TiendaHeader'

export function Confirmacion() {
  const { pedidoId } = useParams()

  return (
    <>
      <TiendaHeader />
      <div className="tienda-contenido tienda-confirmacion" style={{ maxWidth: 480 }}>
        <h1>¡Pedido recibido!</h1>
        <p>Tu número de pedido es:</p>
        <p className="numero-pedido">{pedidoId}</p>
        <p>
          Te vamos a contactar para coordinar el pago y la entrega. Guardá este número por las
          dudas.
        </p>
        <Link to="/tienda" className="tienda-btn" style={{ display: 'inline-block', marginTop: '1rem', textDecoration: 'none' }}>
          Volver a la tienda
        </Link>
      </div>
    </>
  )
}
