import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PedidosNuevosProvider } from '../context/PedidosNuevosContext'
import { PedidosStockInsuficienteProvider } from '../context/PedidosStockInsuficienteContext'
import { NotificacionesFlotantes } from './NotificacionesFlotantes'
import '../staff.css'

const NAV_ITEMS = [
  { to: '/', label: 'Productos', end: true },
  { to: '/cajero', label: 'Caja' },
  { to: '/cierre-caja', label: 'Cierre de caja' },
  { to: '/compras', label: 'Compras' },
  { to: '/proveedores', label: 'Proveedores' },
  { to: '/plantillas-despiece', label: 'Plantillas de despiece' },
  { to: '/movimientos-stock', label: 'Movimientos de stock' },
  { to: '/gastos', label: 'Gastos' },
  { to: '/movimientos-dinero', label: 'Movimientos de dinero' },
  { to: '/fiados', label: 'Fiados' },
  { to: '/pedidos-online', label: 'Pedidos online' },
]

export function AppLayout() {
  return (
    <PedidosNuevosProvider>
      <PedidosStockInsuficienteProvider>
        <AppLayoutInner />
      </PedidosStockInsuficienteProvider>
    </PedidosNuevosProvider>
  )
}

function AppLayoutInner() {
  const { usuario, signOut } = useAuth()

  return (
    <div className="staff">
      <NotificacionesFlotantes />
      <div className="staff-shell">
        <aside className="staff-sidebar">
          <div className="staff-logo">
            <span className="staff-logo-marca">M</span>
            <span className="staff-logo-texto">
              Mar-Cal
              <small>Panel de gestión</small>
            </span>
          </div>

          <nav className="staff-nav">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `staff-nav-link${isActive ? ' activo' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
            <div className="staff-nav-separador" />
            <a
              href="/tienda"
              target="_blank"
              rel="noreferrer"
              className="staff-nav-link"
            >
              Ver tienda online ↗
            </a>
          </nav>

          <div className="staff-user-box">
            <div className="staff-user-nombre">{usuario?.nombre ?? 'Sin datos'}</div>
            <div className="staff-user-rol">{usuario?.rol ?? '—'}</div>
            <button type="button" className="staff-logout" onClick={signOut}>
              Cerrar sesión
            </button>
          </div>
        </aside>

        <main className="staff-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
