import { createPortal } from 'react-dom'
import { NEGOCIO_DIRECCION, NEGOCIO_NOMBRE } from '../config/sucursal'
import { ANCHO_TICKET_MM } from '../lib/ticket'

// Ticket de venta / comanda de pedido para impresora térmica.
//
// Se monta con un portal directo en <body> (fuera del panel): las reglas
// de impresión ocultan TODO el panel, y si el ticket viviera adentro se
// ocultaría con él. En pantalla está siempre oculto; solo aparece al
// imprimir con imprimirTicket() (ver lib/ticket.js y staff.css).
//
// `ticket` sale de ticketDesdeVenta() o ticketDesdePedido().

function moneda(n) {
  return `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function cantidad(n) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 })
}

export function TicketImprimible({ ticket, anchoMm = ANCHO_TICKET_MM }) {
  if (!ticket) return null

  const esComanda = ticket.tipo === 'comanda'
  const fecha = ticket.fecha.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return createPortal(
    <div className={`ticket-print-root ticket-${anchoMm}`}>
      {/* @page no acepta variables CSS: el tamaño del papel va inline. */}
      <style>{`@media print { @page { size: ${anchoMm}mm auto; margin: 0; } }`}</style>

      <div className="ticket">
        <div className="ticket-centro">
          <div className="ticket-negocio">{NEGOCIO_NOMBRE}</div>
          <div>{NEGOCIO_DIRECCION}</div>
        </div>

        <div className="ticket-separador" />

        <div className="ticket-centro ticket-titulo">
          {esComanda ? 'COMANDA - PEDIDO ONLINE' : 'TICKET DE VENTA'}
        </div>
        <div className="ticket-fila">
          <span>N° {ticket.numero}</span>
          <span>{fecha}</span>
        </div>
        {ticket.atendio && <div>Atendió: {ticket.atendio}</div>}

        {(ticket.cliente || ticket.entrega) && <div className="ticket-separador" />}
        {ticket.entrega && <div className="ticket-destacado">{ticket.entrega}</div>}
        {ticket.cliente?.nombre && <div>Cliente: {ticket.cliente.nombre}</div>}
        {ticket.cliente?.telefono && <div>Tel: {ticket.cliente.telefono}</div>}
        {ticket.cliente?.direccion && <div>Dir: {ticket.cliente.direccion}</div>}
        {ticket.notas && <div className="ticket-notas">Notas: {ticket.notas}</div>}

        <div className="ticket-separador" />

        {ticket.items.map((item, i) => (
          <div key={i} className="ticket-item">
            {/* En la comanda la cantidad va primero y grande: es lo que el
                carnicero lee para preparar. */}
            <div className={esComanda ? 'ticket-item-comanda' : undefined}>
              {esComanda ? `${cantidad(item.cantidad)} ${item.unidad} - ${item.descripcion}` : item.descripcion}
            </div>
            <div className="ticket-fila ticket-item-detalle">
              <span>
                {cantidad(item.cantidad)} {item.unidad} x {moneda(item.precioUnitario)}
              </span>
              <span>{moneda(item.subtotal)}</span>
            </div>
            {item.descuento > 0 && (
              <div className="ticket-fila ticket-item-detalle">
                <span>Descuento</span>
                <span>-{moneda(item.descuento)}</span>
              </div>
            )}
            {item.faltante > 0 && <div className="ticket-item-detalle">⚠ Faltan {cantidad(item.faltante)}</div>}
          </div>
        ))}

        <div className="ticket-separador" />

        <div className="ticket-fila">
          <span>Subtotal</span>
          <span>{moneda(ticket.subtotal)}</span>
        </div>
        {ticket.descuento > 0.009 && (
          <div className="ticket-fila">
            <span>Descuento</span>
            <span>-{moneda(ticket.descuento)}</span>
          </div>
        )}
        {ticket.envio > 0 && (
          <div className="ticket-fila">
            <span>Envío</span>
            <span>{moneda(ticket.envio)}</span>
          </div>
        )}
        <div className="ticket-fila ticket-total">
          <span>TOTAL</span>
          <span>{moneda(ticket.total)}</span>
        </div>

        {ticket.pagos.length > 0 && (
          <>
            <div className="ticket-separador" />
            {ticket.pagos.map((p, i) => (
              <div key={i} className="ticket-fila">
                <span>{p.metodo}</span>
                <span>{moneda(p.monto)}</span>
              </div>
            ))}
          </>
        )}

        {ticket.leyendaPago && (
          <>
            <div className="ticket-separador" />
            <div className="ticket-centro ticket-destacado">{ticket.leyendaPago}</div>
          </>
        )}

        <div className="ticket-separador" />
        <div className="ticket-centro">
          {esComanda ? '' : '¡Gracias por su compra!'}
          <div className="ticket-legal">Comprobante no válido como factura</div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
