import { useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { MOTIVOS_MERMA, useProductosConUnidades } from '../lib/inventario'

// Merma con motivo de lista cerrada -> RPC registrar_merma
// (schema_mermas_transformaciones.sql).
export function ModalMerma({ abierto, onCerrar, onRegistrado }) {
  const { productos, error: errorProductos } = useProductosConUnidades(abierto)

  const [buscador, setBuscador] = useState('')
  const [productoId, setProductoId] = useState('')
  const [unidadId, setUnidadId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const productosFiltrados = useMemo(() => {
    const b = buscador.trim().toLowerCase()
    return b ? productos.filter((p) => p.nombre.toLowerCase().includes(b)) : productos
  }, [productos, buscador])

  const producto = productos.find((p) => p.id === productoId)
  const unidades = producto?.unidades_venta_producto ?? []

  function elegirProducto(id) {
    setProductoId(id)
    const p = productos.find((x) => x.id === id)
    // Con una sola unidad (lo habitual: "Kilo") se elige sola.
    setUnidadId(p?.unidades_venta_producto?.length === 1 ? p.unidades_venta_producto[0].id : '')
  }

  function cerrar() {
    if (enviando) return
    setBuscador('')
    setProductoId('')
    setUnidadId('')
    setCantidad('')
    setMotivo('')
    setError(null)
    onCerrar()
  }

  async function confirmar() {
    setError(null)
    if (!productoId || !unidadId) return setError('Elegí el producto y la unidad.')
    if (!(Number(cantidad) > 0)) return setError('La cantidad tiene que ser mayor a cero.')
    if (!motivo) return setError('Elegí el motivo.')

    setEnviando(true)
    const { error } = await supabase.rpc('registrar_merma', {
      p_producto_id: productoId,
      p_cantidad: Number(cantidad),
      p_motivo: motivo,
      p_unidad_id: unidadId,
    })
    setEnviando(false)

    if (error) return setError(error.message)

    const unidad = unidades.find((u) => u.id === unidadId)
    const texto = `Merma registrada: ${cantidad} ${unidad?.nombre_unidad ?? ''} de ${producto?.nombre} (${motivo}).`
    cerrar()
    onRegistrado(texto)
  }

  if (!abierto) return null

  return (
    <div className="staff-modal-overlay" onClick={cerrar}>
      <div
        className="staff-modal-grande"
        style={{ maxWidth: 520 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-merma-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="staff-modal-header">
          <h2 id="modal-merma-titulo" style={{ margin: 0 }}>
            Registrar merma
          </h2>
        </div>

        <div className="staff-modal-cuerpo" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1rem 1.25rem' }}>
          {errorProductos && <p className="staff-mensaje-error">No se pudieron cargar los productos: {errorProductos}</p>}

          <label className="staff-campo">
            Producto
            <input
              type="text"
              placeholder="Buscar producto..."
              value={buscador}
              onChange={(e) => setBuscador(e.target.value)}
            />
            <select value={productoId} onChange={(e) => elegirProducto(e.target.value)}>
              <option value="">Seleccionar...</option>
              {productosFiltrados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label className="staff-campo">
              Cantidad
              <input
                type="number"
                min="0"
                step="0.001"
                placeholder="0"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                style={{ width: 120 }}
              />
            </label>
            <label className="staff-campo">
              Unidad
              <select value={unidadId} onChange={(e) => setUnidadId(e.target.value)} disabled={!producto}>
                <option value="">Unidad...</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre_unidad}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="staff-campo">
            Motivo
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Seleccionar motivo...</option>
              {MOTIVOS_MERMA.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="staff-modal-pie">
          {error && <p className="staff-mensaje-error" style={{ margin: 0, marginRight: 'auto' }}>{error}</p>}
          <button type="button" className="staff-btn staff-btn-secundario" onClick={cerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="staff-btn staff-btn-peligro" onClick={confirmar} disabled={enviando}>
            {enviando ? 'Registrando...' : 'Registrar merma'}
          </button>
        </div>
      </div>
    </div>
  )
}
