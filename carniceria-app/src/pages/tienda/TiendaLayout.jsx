import { Outlet } from 'react-router-dom'
import { CarritoProvider } from './CarritoContext'
import { TiendaToastProvider } from './TiendaToast'
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

  // Clase extra SOLO para compu (el sticky footer de abajo nunca debe
  // aplicarle nada a .mob-app) -- useIsMobile y el resto de este
  // componente quedan exactamente igual.
  return (
    <div className={`tienda${esMobile ? '' : ' tienda-desktop-layout'}`}>
      <CarritoProvider>
        {/* Toast "Se añadió X al carrito" solo en compu: mobile ya tiene
            el suyo en CatalogoMobile (habría dos). */}
        <TiendaToastProvider habilitado={!esMobile}>
          <Outlet />
          {!esMobile && <TiendaFooter />}
          {!esMobile && <WhatsAppButton />}
        </TiendaToastProvider>
      </CarritoProvider>
    </div>
  )
}
