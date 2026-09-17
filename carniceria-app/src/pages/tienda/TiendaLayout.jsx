import { Outlet } from 'react-router-dom'
import { CarritoProvider } from './CarritoContext'
import { WhatsAppButton } from './WhatsAppButton'
import { TiendaFooter } from './TiendaFooter'
import './tienda.css'

export function TiendaLayout() {
  return (
    <div className="tienda">
      <CarritoProvider>
        <Outlet />
        <TiendaFooter />
        <WhatsAppButton />
      </CarritoProvider>
    </div>
  )
}
