import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const ESTADOS_POST_PAGO = ['pagado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado']

const BADGE_POR_ESTADO = {
  pendiente_pago: 'staff-badge-pendiente',
  pagado: 'staff-badge-pagado',
  en_preparacion: 'staff-badge-preparacion',
  en_camino: 'staff-badge-camino',
  entregado: 'staff-badge-pagado',
  cancelado: 'staff-badge-cancelado',
}

export function PedidosOnline() {
  const { usuario } = useAuth()

  const [pedidos, setPedidos] = useState([])
  const [repartidores, setRepartidores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mensaje, setMensaje] = useState(null)
  const [erroresPorPedido, setErroresPorPedido] = useState({})

  async function fetchPedidos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pedidos_online')
      .select('*, detalle_pedidos(*, productos(nombre), unidades_venta_producto(nombre_unidad))')
      .order('fecha_creacion', { ascending: false })

    if (error) setError(error)
    else setPedidos(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchPedidos()
    if (usuario?.rol === 'dueño') {
      supabase
        .from('usuarios')
        .select('*')
        .eq('rol', 'repartidor')
        .then(({ data, error }) => {
          if (!error) setRepartidores(data)
        })
    }
  }, [usuario])

  async function marcarPagado(pedidoId) {
    setMensaje(null)
    const { error } = await supabase.rpc('marcar_pedido_pagado', { p_pedido_id: pedidoId })
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }
    setMensaje({ tipo: 'exito', texto: 'Pedido marcado como pagado.' })
    fetchPedidos()
  }

  async function cambiarEstado(pedidoId, nuevoEstado) {
    setMensaje(null)
    setErroresPorPedido((actual) => ({ ...actual, [pedidoId]: null }))

    // "en_preparacion" es la transición que descuenta stock (y puede
    // rechazarse si algún producto sigue sin stock) -- pasa por el RPC
    // en vez del update directo que usan los demás estados.
    const { error } =
      nuevoEstado === 'en_preparacion'
        ? await supabase.rpc('avanzar_pedido_preparacion', { p_pedido_id: pedidoId })
        : await supabase.from('pedidos_online').update({ estado: nuevoEstado }).eq('id', pedidoId)

    if (error) {
      setErroresPorPedido((actual) => ({ ...actual, [pedidoId]: error.message }))
      return
    }
    fetchPedidos()
  }

  async function asignarRepartidor(pedidoId, repartidorId) {
    setMensaje(null)
    const { error } = await supabase
      .from('pedidos_online')
      .update({ repartidor_id: repartidorId || null })
      .eq('id', pedidoId)

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }
    fetchPedidos()
  }

  if (loading) return <p>Cargando pedidos...</p>
  if (error) return <pre>{JSON.stringify(error, null, 2)}</pre>

  return (
    <div style={{ maxWidth: 920 }}>
      <h1>Pedidos online</h1>

      {mensaje && (
        <p className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'}>
          {mensaje.texto}
        </p>
      )}

      {pedidos.length === 0 && <p>No hay pedidos.</p>}

      {pedidos.map((p) => {
        const tieneStockInsuficiente = p.detalle_pedidos.some((d) => d.stock_insuficiente)

        return (
        <div key={p.id} className="staff-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <strong>{p.cliente_nombre}</strong> — {p.cliente_telefono}
              <p style={{ margin: '0.2rem 0', color: 'var(--color-text-muted)' }}>{p.direccion_envio}</p>
              {p.notas && <p style={{ margin: '0.2rem 0', color: 'var(--color-text-muted)' }}>Notas: {p.notas}</p>}
            </div>
            <span className={`staff-badge ${BADGE_POR_ESTADO[p.estado] ?? ''}`}>{p.estado}</span>
          </div>

          {tieneStockInsuficiente && <div className="staff-alerta-stock">⚠ Stock insuficiente</div>}

          <table className="staff-table" style={{ margin: '0.75rem 0' }}>
            <tbody>
              {p.detalle_pedidos.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.cantidad} x {d.productos?.nombre}
                    {d.stock_insuficiente && (
                      <span className="staff-detalle-faltante">
                        {' '}— Faltan {Number(d.faltante).toFixed(2)} {d.unidades_venta_producto?.nombre_unidad ?? ''}
                      </span>
                    )}
                  </td>
                  <td>${Number(d.subtotal).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="staff-total">
            Productos: ${Number(p.subtotal_productos).toFixed(2)} + Envío: $
            {Number(p.costo_envio).toFixed(2)} = Total: ${Number(p.total).toFixed(2)}
          </p>

          {p.estado === 'pendiente_pago' ? (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              <button type="button" className="staff-btn" onClick={() => marcarPagado(p.id)}>
                Marcar pagado (manual — sin Mercado Pago todavía)
              </button>
              <button
                type="button"
                className="staff-btn staff-btn-secundario"
                onClick={() => cambiarEstado(p.id, 'cancelado')}
              >
                Cancelar pedido
              </button>
            </div>
          ) : (
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ display: 'block' }}>
                Estado:{' '}
                <select value={p.estado} onChange={(e) => cambiarEstado(p.id, e.target.value)}>
                  {ESTADOS_POST_PAGO.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </label>
              {erroresPorPedido[p.id] && (
                <p className="staff-mensaje-error" style={{ margin: '0.35rem 0 0' }}>
                  {erroresPorPedido[p.id]}
                </p>
              )}
            </div>
          )}

          {usuario?.rol === 'dueño' && (
            <label style={{ display: 'block', marginTop: '0.5rem' }}>
              Repartidor:{' '}
              <select
                value={p.repartidor_id ?? ''}
                onChange={(e) => asignarRepartidor(p.id, e.target.value)}
              >
                <option value="">Sin asignar</option>
                {repartidores.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        )
      })}
    </div>
  )
}
