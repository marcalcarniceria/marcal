import { NavLink } from 'react-router-dom'

// Barra de pestañas compartida para agrupar pantallas relacionadas
// dentro de una misma sección del sidebar (Caja, Compras, Movimientos
// de dinero) sin cambiar ninguna ruta existente -- cada pestaña sigue
// siendo la URL real de siempre, esto solo agrega una forma visual de
// saltar entre ellas. `tabs` es [{ to, label, secundaria? }].
export function SeccionTabs({ tabs }) {
  return (
    <div className="staff-tabs">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            `staff-tab${tab.secundaria ? ' staff-tab-secundaria' : ''}${isActive ? ' activo' : ''}`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  )
}
