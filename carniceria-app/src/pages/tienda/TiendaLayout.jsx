import { Outlet } from 'react-router-dom'
import { CarritoProvider } from './CarritoContext'
import { WhatsAppButton } from './WhatsAppButton'
import { TiendaFooter } from './TiendaFooter'
import { useIsMobile } from '../../mobile/useIsMobile'
import './tienda.css'

export function TiendaLayout() {
  // La versión mobile tiene sus propias barras flotantes abajo (carrito,
  // agregar, checkout) que chocarían con el botón de WhatsApp -- y, como
  // el diseño de referencia, no lleva footer (es una experiencia tipo
  // app, de pantalla completa). En compu no cambia nada.
  const esMobile = useIsMobile()

  return (
    <div className="tienda">
      <CarritoProvider>
        <Outlet />
        {!esMobile && <TiendaFooter />}
        {!esMobile && <WhatsAppButton />}
      </CarritoProvider>
    </div>
  )
}
