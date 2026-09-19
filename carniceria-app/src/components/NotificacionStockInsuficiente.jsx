import { useNavigate } from 'react-router-dom'
import { usePedidosStockInsuficiente } from '../context/PedidosStockInsuficienteContext'

export function NotificacionStockInsuficiente() {
  const { cantidadNuevos, resetear } = usePedidosStockInsuficiente()
  const navigate = useNavigate()

  if (cantidadNuevos === 0) return null

  function verPedidos() {
    resetear()
    navigate('/pedidos-online')
  }

  return (
    <div className="staff-toast staff-toast-alerta" role="status">
      <p className="staff-toast-texto">
        {cantidadNuevos === 1
          ? 'Tenés un pedido con stock insuficiente'
          : `Tenés ${cantidadNuevos} pedidos con stock insuficiente`}
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
