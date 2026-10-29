// Impresión de tickets/comandas en impresora térmica.
//
// Cómo funciona: TicketImprimible se monta (vía portal) directo en
// <body>, fuera del panel, y en pantalla está oculto. imprimirTicket()
// agrega la clase `modo-ticket` a <body> mientras dura la impresión: las
// reglas @media print de staff.css SOLO actúan con esa clase (ocultan el
// panel y muestran el ticket). Así un Ctrl+P normal sobre el panel sigue
// imprimiendo la pantalla como siempre, no una hoja en blanco.

// Ancho del rollo: 80 o 58 (mm). Cambiar acá si la impresora es de 58mm.
export const ANCHO_TICKET_MM = 80

export function imprimirTicket() {
  const body = document.body
  body.classList.add('modo-ticket')

  function limpiar() {
    body.classList.remove('modo-ticket')
    window.removeEventListener('afterprint', limpiar)
  }
  window.addEventListener('afterprint', limpiar)

  // El portal del ticket se monta en el mismo render que dispara la
  // impresión: un frame de espera asegura que ya esté en el DOM.
  requestAnimationFrame(() => {
    window.print()
    // Respaldo: algunos navegadores no disparan afterprint.
    setTimeout(limpiar, 1000)
  })
}

function numeroCorto(id) {
  return id ? String(id).slice(0, 8).toUpperCase() : ''
}

// ---------- Venta de mostrador (Cajero.jsx) ----------
// Se arma con una FOTO del carrito tomada antes de que Cajero lo vacíe.
export function ticketDesdeVenta({ ventaId, carrito, totalBruto, totalNeto, pagos, metodosPago, clienteFiado, cajero }) {
  const nombreMetodo = (id) => metodosPago.find((m) => m.id === id)?.nombre ?? 'Pago'
  return {
    tipo: 'venta',
    numero: numeroCorto(ventaId),
    fecha: new Date(),
    atendio: cajero ?? null,
    cliente: clienteFiado ? { nombre: clienteFiado } : null,
    items: carrito.map((i) => ({
      // En Cajero los combos ya vienen normalizados con su nombre acá.
      descripcion: i.producto_nombre ?? 'Producto',
      cantidad: Number(i.cantidad),
      unidad: i.combo_id ? 'u' : i.unidad_nombre,
      precioUnitario: Number(i.precio_unitario_historico),
      descuento: Number(i.descuento_aplicado) || 0,
      subtotal: Number(i.cantidad) * Number(i.precio_unitario_historico) - (Number(i.descuento_aplicado) || 0),
    })),
    subtotal: totalBruto,
    descuento: totalBruto - totalNeto,
    envio: 0,
    total: totalNeto,
    pagos: clienteFiado
      ? [{ metodo: 'A cuenta (fiado)', monto: totalNeto }]
      : pagos.map((p) => ({ metodo: nombreMetodo(p.metodo_pago_id), monto: Number(p.monto) })),
    leyendaPago: null,
  }
}

// ---------- Comanda de pedido online (PedidosOnline.jsx) ----------
export function ticketDesdePedido(pedido) {
  const pagado = Boolean(pedido.fecha_pago)
  const esMp = pedido.metodo_pago === 'mercadopago'
  return {
    tipo: 'comanda',
    numero: numeroCorto(pedido.id),
    fecha: new Date(pedido.fecha_creacion ?? Date.now()),
    atendio: null,
    cliente: {
      nombre: pedido.cliente_nombre,
      telefono: pedido.cliente_telefono,
      direccion: pedido.metodo_entrega === 'retiro' ? null : pedido.direccion_envio,
    },
    entrega: pedido.metodo_entrega === 'retiro' ? 'RETIRA EN EL LOCAL' : 'ENVÍO A DOMICILIO',
    notas: pedido.notas,
    items: (pedido.detalle_pedidos ?? []).map((d) => ({
      descripcion: d.combo_id ? `Combo ${d.combos?.nombre ?? ''}` : d.productos?.nombre ?? 'Producto',
      cantidad: Number(d.cantidad),
      unidad: d.combo_id ? 'u' : d.unidades_venta_producto?.nombre_unidad ?? '',
      precioUnitario: Number(d.precio_unitario),
      descuento: 0,
      subtotal: Number(d.subtotal),
      faltante: d.stock_insuficiente ? Number(d.faltante) : null,
    })),
    subtotal: Number(pedido.subtotal_productos),
    descuento: 0,
    envio: Number(pedido.costo_envio) || 0,
    total: Number(pedido.total),
    pagos: [],
    // Lo que más le importa al repartidor: ¿tiene que cobrar o no?
    leyendaPago: pagado
      ? `PAGADO (${esMp ? 'Mercado Pago' : 'Efectivo'})`
      : esMp
        ? 'MERCADO PAGO - PENDIENTE DE ACREDITAR'
        : `COBRAR EN EFECTIVO: $${Number(pedido.total).toFixed(2)}`,
  }
}
