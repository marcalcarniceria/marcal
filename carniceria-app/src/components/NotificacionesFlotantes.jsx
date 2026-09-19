import { NotificacionPedidosNuevos } from './NotificacionPedidosNuevos'
import { NotificacionStockInsuficiente } from './NotificacionStockInsuficiente'

// Contenedor único para todos los toasts del panel: cada notificación
// es independiente (contador y canal de Realtime propios), pero
// comparten esta pila para no superponerse -- se apilan uno debajo del
// otro si ambos están visibles a la vez.
export function NotificacionesFlotantes() {
  return (
    <div className="staff-toast-stack">
      <NotificacionPedidosNuevos />
      <NotificacionStockInsuficiente />
    </div>
  )
}
