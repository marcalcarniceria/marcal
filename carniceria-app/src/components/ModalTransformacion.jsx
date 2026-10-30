import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useProductosConUnidades } from '../lib/inventario'

// Transformación de productos (ej. 5 kg de Paleta -> 4,6 kg de Carne
// picada) -> RPC registrar_transformacion (schema_mermas_transformaciones.sql).
// Admite varias líneas de cada lado: recortes de varios cortes -> picada,
// o un vacío -> milanesas + recortes. El costo de los orígenes pasa a los
// destinos en el servidor.

// Key con contador, NO crypto.randomUUID(): randomUUID solo existe en
// contextos seguros (HTTPS o localhost). Abriendo el panel por la IP de la
// red (http://192.168...) o en iOS < 15.4 tiraba "crypto.randomUUID is not
// a function" al montar MovimientosStock -- este modal se monta aunque
// esté cerrado -- y la pantalla quedaba en blanco.
let contadorLineas = 0
function lineaVacia() {
  contadorLineas += 1
  return { key: `linea-${contadorLineas}`, productoId: '', unidadId: '', cantidad: '' }
}

function formatoCantidad(n) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 })
}

function LineasProducto({ titulo, lineas, setLineas, productos, deshabilitado }) {
  function actualizar(key, campo, valor) {
    setLineas((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        if (campo !== 'productoId') return { ...l, [campo]: valor }
        // Con una sola unidad (lo habitual: "Kilo") se elige sola.
        const p = productos.find((x) => x.id === valor)
        const unidades = p?.unidades_venta_producto ?? []
        return { ...l, productoId: valor, unidadId: unidades.length === 1 ? unidades[0].id : '' }
      }),
    )
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 0.5rem' }}>{titulo}</h3>
      {lineas.map((l) => {
        const unidades = productos.find((p) => p.id === l.productoId)?.unidades_venta_producto ?? []
        return (
          <div key={l.key} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem' }}>
            <select
              value={l.productoId}
              onChange={(e) => actualizar(l.key, 'productoId', e.target.value)}
              disabled={deshabilitado}
              style={{ flex: '1 1 220px', minWidth: 0 }}
            >
              <option value="">Producto...</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.001"
              placeholder="Cantidad"
              value={l.cantidad}
              onChange={(e) => actualizar(l.key, 'cantidad', e.target.value)}
              disabled={deshabilitado}
              style={{ width: 110 }}
            />
            <select
              value={l.unidadId}
              onChange={(e) => actualizar(l.key, 'unidadId', e.target.value)}
              disabled={deshabilitado || !l.productoId}
            >
              <option value="">Unidad...</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre_unidad}
                </option>
              ))}
            </select>
            {lineas.length > 1 && (
              <button
                type="button"
                className="staff-btn staff-btn-secundario"
                onClick={() => setLineas((prev) => prev.filter((x) => x.key !== l.key))}
                disabled={deshabilitado}
                aria-label="Quitar línea"
              >
                Quitar
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="staff-btn staff-btn-secundario"
        onClick={() => setLineas((prev) => [...prev, lineaVacia()])}
        disabled={deshabilitado}
      >
        + Agregar línea
      </button>
    </div>
  )
}

export function ModalTransformacion({ abierto, onCerrar, onRegistrado }) {
  const { productos, error: errorProductos } = useProductosConUnidades(abierto)

  const [origenes, setOrigenes] = useState(() => [lineaVacia()])
  const [destinos, setDestinos] = useState(() => [lineaVacia()])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  // Cantidad en unidad base de una línea (para el rendimiento).
  function cantidadBase(l) {
    const u = productos
      .find((p) => p.id === l.productoId)
      ?.unidades_venta_producto?.find((x) => x.id === l.unidadId)
    const c = Number(l.cantidad)
    return u && c > 0 ? c * Number(u.factor_conversion_base) : 0
  }

  const totalOrigen = origenes.reduce((acc, l) => acc + cantidadBase(l), 0)
  const totalDestino = destinos.reduce((acc, l) => acc + cantidadBase(l), 0)
  const rendimiento = totalOrigen > 0 && totalDestino > 0 ? (totalDestino / totalOrigen) * 100 : null

  function lineaCompleta(l) {
    return l.productoId && l.unidadId && Number(l.cantidad) > 0
  }

  function cerrar() {
    if (enviando) return
    setOrigenes([lineaVacia()])
    setDestinos([lineaVacia()])
    setError(null)
    onCerrar()
  }

  async function confirmar() {
    setError(null)
    if (!origenes.every(lineaCompleta) || !destinos.every(lineaCompleta)) {
      return setError('Completá producto, cantidad y unidad en todas las líneas (o quitá las vacías).')
    }

    const aPayload = (l) => ({ producto_id: l.productoId, unidad_venta_id: l.unidadId, cantidad: Number(l.cantidad) })

    setEnviando(true)
    const { data, error } = await supabase.rpc('registrar_transformacion', {
      p_origenes: origenes.map(aPayload),
      p_destinos: destinos.map(aPayload),
    })
    setEnviando(false)

    if (error) return setError(error.message)

    const texto = data?.costos_actualizados
      ? `Transformación registrada. Costo trasladado a los destinos: $${Number(data.costo_total).toFixed(2)}.`
      : 'Transformación registrada. Algún origen no tenía costo cargado: el stock se movió, pero los costos de los destinos no se modificaron.'
    cerrar()
    onRegistrado(texto)
  }

  if (!abierto) return null

  return (
    <div className="staff-modal-overlay" onClick={cerrar}>
      <div
        className="staff-modal-grande"
        style={{ maxWidth: 760 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-transformacion-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="staff-modal-header">
          <h2 id="modal-transformacion-titulo" style={{ margin: 0 }}>
            Registrar transformación
          </h2>
        </div>

        <div className="staff-modal-cuerpo" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1.25rem' }}>
          {errorProductos && <p className="staff-mensaje-error">No se pudieron cargar los productos: {errorProductos}</p>}

          <LineasProducto
            titulo="Sale del stock (origen)"
            lineas={origenes}
            setLineas={setOrigenes}
            productos={productos}
            deshabilitado={enviando}
          />
          <LineasProducto
            titulo="Entra al stock (resultado)"
            lineas={destinos}
            setLineas={setDestinos}
            productos={productos}
            deshabilitado={enviando}
          />

          {rendimiento !== null && (
            <p className="staff-modal-nota" style={{ margin: 0 }}>
              Entran {formatoCantidad(totalOrigen)} y salen {formatoCantidad(totalDestino)} (unidad base): rendimiento{' '}
              <strong>{rendimiento.toFixed(1)}%</strong>
              {totalDestino < totalOrigen &&
                ` — la diferencia (${formatoCantidad(totalOrigen - totalDestino)}) es pérdida del proceso y queda absorbida en el costo del resultado.`}
            </p>
          )}
        </div>

        <div className="staff-modal-pie">
          {error && <p className="staff-mensaje-error" style={{ margin: 0, marginRight: 'auto' }}>{error}</p>}
          <button type="button" className="staff-btn staff-btn-secundario" onClick={cerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="staff-btn" onClick={confirmar} disabled={enviando}>
            {enviando ? 'Registrando...' : 'Confirmar transformación'}
          </button>
        </div>
      </div>
    </div>
  )
}
