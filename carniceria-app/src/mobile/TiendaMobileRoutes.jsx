import { Navigate } from 'react-router-dom'
import { useIsMobile } from './useIsMobile'
import { CatalogoMobile } from './CatalogoMobile'
import { Tienda } from '../pages/tienda/Tienda'
import { Carrito } from '../pages/tienda/Carrito'
import { Checkout } from '../pages/tienda/Checkout'
import { Confirmacion } from '../pages/tienda/Confirmacion'
import { CrearCuenta } from '../pages/tienda/CrearCuenta'
import './mobile.css'

// Placeholder temporal -- cada etapa del plan reemplaza una de estas
// pantallas por la versión mobile real (ver PASADO en la conversación:
// catálogo+detalle, carrito, login, checkout, mis pedidos+confirmación).
function PantallaEnConstruccion({ nombre }) {
  return (
    <div className="mob-app">
      <p className="mob-placeholder">Versión mobile de "{nombre}" -- en construcción.</p>
    </div>
  )
}

// Rutas que YA existen para compu (index, carrito, checkout, confirmación,
// crear-cuenta): en mobile muestran su versión nueva; en pantalla ancha
// siguen mostrando EXACTAMENTE el componente de compu de siempre, sin
// ningún cambio.
export function CatalogoSwitch() {
  return useIsMobile() ? <CatalogoMobile /> : <Tienda />
}

export function CarritoSwitch() {
  return useIsMobile() ? <PantallaEnConstruccion nombre="Carrito" /> : <Carrito />
}

export function CheckoutSwitch() {
  return useIsMobile() ? <PantallaEnConstruccion nombre="Checkout" /> : <Checkout />
}

export function ConfirmacionSwitch() {
  return useIsMobile() ? <PantallaEnConstruccion nombre="Confirmación" /> : <Confirmacion />
}

export function CrearCuentaSwitch() {
  return useIsMobile() ? <PantallaEnConstruccion nombre="Crear cuenta" /> : <CrearCuenta />
}

// Rutas NUEVAS que no existen para compu (detalle de producto, login,
// mis pedidos vía URL): si alguien las abre desde una pantalla ancha, se
// manda al catálogo de compu en vez de mostrar algo roto o a medio hacer.
export function SoloMobile({ children }) {
  const esMobile = useIsMobile()
  if (!esMobile) return <Navigate to="/tienda" replace />
  return children
}
