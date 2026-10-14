import { useMisPedidos } from './useMisPedidos'

// Mismo mapeo de estado -> color que PedidosOnline.jsx (pantalla de
// staff) para mantener consistencia visual, pero con clases propias de
// tienda.css: las dos áreas del sistema tienen sistemas de diseño CSS
// separados a propósito (ver notas del proyecto), así que se reusan los
// mismos colores, no las mismas clases.
const BADGE_POR_ESTADO = {
  pendiente_pago: 'tienda-badge-pendiente',
  pagado: 'tienda-badge-pagado',
  en_preparacion: 'tienda-badge-preparacion',
  en_camino: 'tienda-badge-camino',
  entregado: 'tienda-badge-pagado',
  cancelado: 'tienda-badge-cancelado',
}

// Texto legible para el cliente -- en la base el estado queda en
// minúsculas/snake_case (ver check constraint de pedidos_online en
// schema_ecommerce.sql), pero eso no es lo que se le muestra a alguien
// que no conoce el sistema.
const TEXTO_POR_ESTADO = {
  pendiente_pago: 'Pendiente de pago',
  pagado: 'Pagado',
  en_preparacion: 'En preparación',
  en_camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

export function MisPedidosModal({ onClose }) {
  const {
    pedidos,
    detallePorPedido,
    totalFilas,
    pagina,
    setPagina,
    loading,
    error,
    repitiendoId,
    repetirPedido: repetirPedidoBase,
    haySiguiente,
    FILAS_POR_PAGINA,
  } = useMisPedidos()

  // El hook ya agrega los items y navega al carrito -- acá solo se le
  // suma cerrar el modal, que es específico de esta versión (compu).
  async function repetirPedido(pedidoId) {
    await repetirPedidoBase(pedidoId)
    onClose()
  }

  return (
    <div className="tienda-modal-overlay" onClick={onClose}>
      <div className="tienda-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tienda-modal-cerrar" onClick={onClose} aria-label="Cerrar">
          ×
        </button>

        <h2 style={{ marginTop: 0 }}>Mis pedidos</h2>

        {loading && <p>Cargando...</p>}
        {error && <p className="tienda-error">{error.message}</p>}

        {!loading && !error && pedidos.length === 0 && <p>Todavía no hiciste ningún pedido.</p>}

        {!loading && !error && pedidos.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
              {pedidos.map((p) => {
                const lineas = detallePorPedido[p.id] ?? []
                return (
                  <div key={p.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong>
                        {new Date(p.fecha_creacion).toLocaleDateString('es-AR')}
                        {' '}
                        {new Date(p.fecha_creacion).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </strong>
                      <span className={`tienda-badge ${BADGE_POR_ESTADO[p.estado] ?? ''}`}>
                        {TEXTO_POR_ESTADO[p.estado] ?? p.estado}
                      </span>
                    </div>

                    <p style={{ margin: '0.35rem 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {p.metodo_entrega === 'retiro' ? 'Retira en el local' : p.direccion_envio}
                      {' · '}
                      {p.metodo_pago === 'efectivo' ? 'Efectivo' : 'Mercado Pago'}
                    </p>

                    {p.repartidor_nombre && (
                      <p style={{ margin: '0.15rem 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        Repartidor: {p.repartidor_nombre}
                      </p>
                    )}

                    <div style={{ margin: '0.5rem 0' }}>
                      {lineas.map((d, i) => (
                        <div
                          key={i}
                          style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}
                        >
                          <span>
                            {Number(d.cantidad)} x {d.combo_id ? d.combos?.nombre ?? 'Combo' : d.productos?.nombre}
                            {' '}(${Number(d.precio_unitario).toFixed(2)} c/u)
                          </span>
                          <span>${Number(d.subtotal).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    <p style={{ margin: 0, fontWeight: 600 }}>
                      Productos: ${Number(p.subtotal_productos).toFixed(2)} + Envío: ${Number(p.costo_envio).toFixed(2)} = Total: $
                      {Number(p.total).toFixed(2)}
                    </p>

                    <button
                      type="button"
                      className="tienda-btn tienda-btn-secundario"
                      style={{ marginTop: '0.5rem' }}
                      onClick={() => repetirPedido(p.id)}
                      disabled={repitiendoId === p.id}
                    >
                      {repitiendoId === p.id ? 'Agregando...' : 'Repetir pedido'}
                    </button>
                  </div>
                )
              })}
            </div>

            {totalFilas > FILAS_POR_PAGINA && (
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="tienda-btn tienda-btn-secundario"
                  onClick={() => setPagina((pg) => pg - 1)}
                  disabled={pagina === 0}
                >
                  ← Anterior
                </button>
                <span style={{ fontSize: '0.85rem' }}>Página {pagina + 1}</span>
                <button
                  type="button"
                  className="tienda-btn tienda-btn-secundario"
                  onClick={() => setPagina((pg) => pg + 1)}
                  disabled={!haySiguiente}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
