import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useCarrito } from './CarritoContext'

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

const FILAS_POR_PAGINA = 5

export function MisPedidosModal({ clienteId, onClose }) {
  const navigate = useNavigate()
  const { agregarItem } = useCarrito()

  const [pedidos, setPedidos] = useState([])
  const [detallePorPedido, setDetallePorPedido] = useState({})
  const [totalFilas, setTotalFilas] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [repitiendoId, setRepitiendoId] = useState(null)

  useEffect(() => {
    async function fetchPedidos() {
      setLoading(true)
      setError(null)

      const { data: pedidosData, error: errorPedidos } = await supabase.rpc('obtener_mis_pedidos', {
        p_limit: FILAS_POR_PAGINA,
        p_offset: pagina * FILAS_POR_PAGINA,
      })

      if (errorPedidos) {
        setError(errorPedidos)
        setLoading(false)
        return
      }

      setPedidos(pedidosData)
      setTotalFilas(pedidosData[0]?.total_pedidos ?? 0)

      const ids = pedidosData.map((p) => p.id)
      if (ids.length === 0) {
        setDetallePorPedido({})
        setLoading(false)
        return
      }

      const { data: detalleData, error: errorDetalle } = await supabase
        .from('detalle_pedidos')
        .select(
          'pedido_id, cantidad, precio_unitario, subtotal, producto_id, unidad_venta_id, combo_id, productos(nombre), combos(nombre), unidades_venta_producto(nombre_unidad)',
        )
        .in('pedido_id', ids)

      if (errorDetalle) {
        setError(errorDetalle)
        setLoading(false)
        return
      }

      const agrupado = {}
      for (const d of detalleData) {
        agrupado[d.pedido_id] = [...(agrupado[d.pedido_id] ?? []), d]
      }
      setDetallePorPedido(agrupado)
      setLoading(false)
    }

    fetchPedidos()
  }, [clienteId, pagina])

  async function repetirPedido(pedidoId) {
    const lineas = detallePorPedido[pedidoId] ?? []
    if (lineas.length === 0) return

    setRepitiendoId(pedidoId)

    for (const linea of lineas) {
      if (linea.combo_id) {
        agregarItem(
          {
            combo_id: linea.combo_id,
            producto_nombre: linea.combos?.nombre ?? 'Combo',
            unidad_nombre: 'Combo',
            precio_venta: Number(linea.precio_unitario),
          },
          Number(linea.cantidad),
        )
      } else {
        agregarItem(
          {
            producto_id: linea.producto_id,
            producto_nombre: linea.productos?.nombre ?? 'Producto',
            unidad_venta_id: linea.unidad_venta_id,
            unidad_nombre: linea.unidades_venta_producto?.nombre_unidad ?? '',
            precio_venta: Number(linea.precio_unitario),
          },
          Number(linea.cantidad),
        )
      }
    }

    setRepitiendoId(null)
    onClose()
    navigate('/tienda/carrito')
  }

  const haySiguiente = (pagina + 1) * FILAS_POR_PAGINA < totalFilas

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
