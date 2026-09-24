import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'

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

export function MisPedidosModal({ clienteId, onClose }) {
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchPedidos() {
      setLoading(true)
      const { data, error } = await supabase
        .from('pedidos_online')
        .select('id, fecha_creacion, total, estado, detalle_pedidos(cantidad, productos(nombre), combos(nombre))')
        .eq('cliente_web_id', clienteId)
        .order('fecha_creacion', { ascending: false })

      if (error) setError(error)
      else setPedidos(data)
      setLoading(false)
    }

    fetchPedidos()
  }, [clienteId])

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
            {pedidos.map((p) => (
              <div key={p.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
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
                  {p.detalle_pedidos
                    .map((d) => `${d.cantidad} x ${d.productos?.nombre ?? d.combos?.nombre ?? 'Producto'}`)
                    .join(', ')}
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>Total: ${Number(p.total).toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
