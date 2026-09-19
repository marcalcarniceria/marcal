import { useNavigate } from 'react-router-dom'
import { usePedidosNuevos } from '../context/PedidosNuevosContext'

export function NotificacionPedidosNuevos() {
  const { cantidadNuevos, resetear } = usePedidosNuevos()
  const navigate = useNavigate()

  if (cantidadNuevos === 0) return null

  function verPedidos() {
    resetear()
    navigate('/pedidos-online')
  }

  return (
    <div className="staff-toast" role="status">
      <p className="staff-toast-texto">
        {cantidadNuevos === 1 ? 'Tenés un pedido nuevo' : `Tenés ${cantidadNuevos} pedidos nuevos`}
      </p>
      <div className="staff-toast-acciones">
        <button type="button" className="staff-btn staff-toast-ver" onClick={verPedidos}>
          Ver
        </button>
        <button type="button" className="staff-toast-cerrar" onClick={resetear} aria-label="Cerrar notificación">
          ×
        </button>
      </div>
    </div>
  )
}
