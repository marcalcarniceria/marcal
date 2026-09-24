import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PedidosNuevosProvider } from '../context/PedidosNuevosContext'
import { PedidosStockInsuficienteProvider } from '../context/PedidosStockInsuficienteContext'
import { NotificacionesFlotantes } from './NotificacionesFlotantes'
import '../staff.css'

// 'Reportes' se agrega aparte (no en esta lista fija) porque solo se
// muestra para el rol 'dueño' -- ver armado del nav más abajo.
const NAV_ITEMS = [
  { to: '/', label: 'Productos', end: true },
  { to: '/combos', label: 'Combos' },
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
  // Puramente visual: solo controla si el resto del sidebar (nav + datos
  // de usuario) se ve desplegado en mobile -- antes ese bloque se
  // escondía del todo en pantallas chicas (bug preexistente: "Cerrar
  // sesión" quedaba inalcanzable desde el celular). Ahora nada se oculta,
  // solo se colapsa detrás de este botón.
  const [menuMobileAbierto, setMenuMobileAbierto] = useState(false)

  function cerrarMenuMobile() {
    setMenuMobileAbierto(false)
  }

  return (
    <div className="staff">
      <NotificacionesFlotantes />
      <div className="staff-shell">
        <aside className="staff-sidebar">
          <div className="staff-sidebar-top">
            <div className="staff-logo">
              <span className="staff-logo-marca">M</span>
              <span className="staff-logo-texto">
                Mar-Cal
                <small>Panel de gestión</small>
              </span>
            </div>

            <button
              type="button"
              className="staff-menu-toggle"
              onClick={() => setMenuMobileAbierto((abierto) => !abierto)}
              aria-label={menuMobileAbierto ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuMobileAbierto}
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          <div className={`staff-sidebar-colapsable${menuMobileAbierto ? ' abierto' : ''}`}>
            <nav className="staff-nav">
              {usuario?.rol === 'dueño' && (
                <NavLink
                  to="/reportes"
                  onClick={cerrarMenuMobile}
                  className={({ isActive }) => `staff-nav-link${isActive ? ' activo' : ''}`}
                >
                  Reportes
                </NavLink>
              )}
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={cerrarMenuMobile}
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
                onClick={cerrarMenuMobile}
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
          </div>
        </aside>

        <main className="staff-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
