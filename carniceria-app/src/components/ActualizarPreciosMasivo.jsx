import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { SUCURSAL_ID } from '../config/sucursal'

// Actualización masiva de precios de venta (solo dueño). Trabaja sobre la
// lista de productos que ya cargó Productos.jsx -- no vuelve a consultar
// el catálogo. Los cambios se guardan por unidad de venta y viajan juntos
// a la RPC actualizar_precios_masivo (una sola transacción, con historial
// en historial_precios). Ver schema_precios_masivo.sql.

const CATEGORIAS = [
  { valor: '', etiqueta: 'Todas las categorías' },
  { valor: 'carniceria', etiqueta: 'Carnicería' },
  { valor: 'verduleria', etiqueta: 'Verdulería' },
  { valor: 'mas_productos', etiqueta: 'Más productos' },
  { valor: 'sin_categoria', etiqueta: 'Sin categoría' },
]

const REDONDEOS = [
  { valor: 0, etiqueta: 'Sin redondeo' },
  { valor: 10, etiqueta: 'a $10' },
  { valor: 50, etiqueta: 'a $50' },
  { valor: 100, etiqueta: 'a $100' },
]

function redondear(valor, paso) {
  if (!paso) return Math.round(valor * 100) / 100
  return Math.round(valor / paso) * paso
}

function formatoPrecio(n) {
  return `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function ActualizarPreciosMasivo({ abierto, productos, onCerrar, onActualizado }) {
  const [categoria, setCategoria] = useState('')
  const [proveedores, setProveedores] = useState([])
  const [proveedorId, setProveedorId] = useState('')
  // null = sin filtro de proveedor; Set = ids de productos comprados a él
  const [productosDelProveedor, setProductosDelProveedor] = useState(null)
  const [cargandoProveedor, setCargandoProveedor] = useState(false)

  const [porcentaje, setPorcentaje] = useState('')
  const [redondeo, setRedondeo] = useState(0)
  // unidad_venta_id -> string del input (lo que escribió el dueño o lo que
  // calculó el porcentaje). Sobrevive a los cambios de filtro: se puede
  // aplicar +15% a Carnicería, cambiar a Verdulería, aplicar +10% y
  // confirmar todo junto.
  const [preciosNuevos, setPreciosNuevos] = useState({})

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!abierto) return
    supabase
      .from('proveedores')
      .select('id, nombre')
      .eq('sucursal_id', SUCURSAL_ID)
      .order('nombre')
      .then(({ data }) => setProveedores(data ?? []))
  }, [abierto])

  // Los productos no tienen proveedor asignado: "productos de un
  // proveedor" = los que alguna vez se le compraron (detalle_compras).
  async function cambiarProveedor(id) {
    setProveedorId(id)
    if (!id) {
      setProductosDelProveedor(null)
      return
    }
    setCargandoProveedor(true)
    const { data, error } = await supabase
      .from('detalle_compras')
      .select('producto_id, compras_proveedor!inner(proveedor_id)')
      .eq('compras_proveedor.proveedor_id', id)
    setCargandoProveedor(false)
    if (error) {
      setError(`No se pudieron cargar los productos del proveedor: ${error.message}`)
      setProductosDelProveedor(new Set())
      return
    }
    setProductosDelProveedor(new Set((data ?? []).map((d) => d.producto_id)))
  }

  // Una fila por unidad de venta de los productos activos que pasan los
  // filtros, ordenadas por producto.
  const filas = useMemo(() => {
    return productos
      .filter((p) => p.activo !== false)
      .filter((p) => {
        if (!categoria) return true
        if (categoria === 'sin_categoria') return !p.categoria
        return p.categoria === categoria
      })
      .filter((p) => !productosDelProveedor || productosDelProveedor.has(p.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .flatMap((p) =>
        (p.unidades_venta_producto ?? []).map((u) => ({
          unidad_venta_id: u.id,
          producto_nombre: p.nombre,
          unidad_nombre: u.nombre_unidad,
          precio_actual: Number(u.precio_venta),
          precio_promocional: u.precio_promocional != null ? Number(u.precio_promocional) : null,
        })),
      )
  }, [productos, categoria, productosDelProveedor])

  // Todas las unidades (no solo las visibles), para validar y enviar
  // cambios hechos con otros filtros.
  const precioActualPorUnidad = useMemo(() => {
    const mapa = {}
    for (const p of productos) {
      for (const u of p.unidades_venta_producto ?? []) mapa[u.id] = Number(u.precio_venta)
    }
    return mapa
  }, [productos])

  const cambios = useMemo(
    () =>
      Object.entries(preciosNuevos)
        .filter(([id, valor]) => valor !== '' && Number(valor) !== precioActualPorUnidad[id])
        .map(([id, valor]) => ({ unidad_venta_id: id, precio_nuevo: Number(valor) })),
    [preciosNuevos, precioActualPorUnidad],
  )

  const hayInvalidos = cambios.some((c) => !Number.isFinite(c.precio_nuevo) || c.precio_nuevo <= 0)

  const cambiosFueraDelFiltro = useMemo(() => {
    const visibles = new Set(filas.map((f) => f.unidad_venta_id))
    return cambios.filter((c) => !visibles.has(c.unidad_venta_id)).length
  }, [cambios, filas])

  function aplicarPorcentaje() {
    const pct = Number(porcentaje)
    if (porcentaje === '' || !Number.isFinite(pct) || pct <= -100) {
      setError('Ingresá un porcentaje válido (ej. 15 para +15%, -5 para bajar 5%).')
      return
    }
    setError(null)
    setPreciosNuevos((prev) => {
      const siguiente = { ...prev }
      for (const f of filas) {
        siguiente[f.unidad_venta_id] = String(redondear(f.precio_actual * (1 + pct / 100), redondeo))
      }
      return siguiente
    })
  }

  function cambiarPrecio(unidadId, valor) {
    setPreciosNuevos((prev) => ({ ...prev, [unidadId]: valor }))
  }

  function descartarCambios() {
    setPreciosNuevos({})
    setError(null)
  }

  function cerrar() {
    if (guardando) return
    setPreciosNuevos({})
    setPorcentaje('')
    setError(null)
    onCerrar()
  }

  async function confirmar() {
    if (cambios.length === 0 || hayInvalidos) return
    setGuardando(true)
    setError(null)

    const { data, error } = await supabase.rpc('actualizar_precios_masivo', { p_cambios: cambios })

    setGuardando(false)
    if (error) {
      setError(error.message)
      return
    }

    setPreciosNuevos({})
    setPorcentaje('')
    onActualizado(data ?? cambios.length)
  }

  useEffect(() => {
    if (!abierto) return
    function alPresionarTecla(e) {
      if (e.key === 'Escape') cerrar()
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  })

  if (!abierto) return null

  return (
    <div className="staff-modal-overlay" onClick={cerrar}>
      <div
        className="staff-modal-grande"
        role="dialog"
        aria-modal="true"
        aria-labelledby="precios-masivo-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="staff-modal-header">
          <h2 id="precios-masivo-titulo" style={{ margin: 0 }}>
            Actualización masiva de precios
          </h2>
          <button type="button" className="staff-btn staff-btn-secundario" onClick={cerrar} disabled={guardando}>
            Cerrar
          </button>
        </div>

        {/* a) Filtros */}
        <div className="staff-modal-controles">
          <label>
            Categoría
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label>
            Proveedor
            <select value={proveedorId} onChange={(e) => cambiarProveedor(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>

          {/* b) Porcentaje */}
          <label>
            Aumento %
            <input
              type="number"
              step="0.1"
              placeholder="15"
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              style={{ width: 90 }}
            />
          </label>
          <label>
            Redondear
            <select value={redondeo} onChange={(e) => setRedondeo(Number(e.target.value))}>
              {REDONDEOS.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="staff-btn"
            onClick={aplicarPorcentaje}
            disabled={filas.length === 0 || guardando}
          >
            Aplicar a {filas.length} {filas.length === 1 ? 'unidad' : 'unidades'}
          </button>
        </div>

        {proveedorId && (
          <p className="staff-modal-nota">
            Se muestran los productos que alguna vez se le compraron a este proveedor.
          </p>
        )}

        {/* c) Previsualización */}
        <div className="staff-modal-cuerpo">
          {cargandoProveedor && <p>Cargando productos del proveedor...</p>}
          {!cargandoProveedor && filas.length === 0 && <p>No hay productos activos con estos filtros.</p>}
          {!cargandoProveedor && filas.length > 0 && (
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Unidad</th>
                  <th>Precio actual</th>
                  <th>Precio nuevo</th>
                  <th>Variación</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const valor = preciosNuevos[f.unidad_venta_id] ?? ''
                  const nuevo = Number(valor)
                  const cambiado = valor !== '' && nuevo !== f.precio_actual
                  const invalido = valor !== '' && (!Number.isFinite(nuevo) || nuevo <= 0)
                  const variacion = cambiado && !invalido ? ((nuevo - f.precio_actual) / f.precio_actual) * 100 : null
                  return (
                    <tr key={f.unidad_venta_id} className={cambiado ? 'precios-masivo-fila-cambiada' : undefined}>
                      <td>
                        {f.producto_nombre}
                        {f.precio_promocional !== null && (
                          <div className="staff-modal-nota" style={{ margin: 0 }}>
                            En oferta a {formatoPrecio(f.precio_promocional)}: se sigue cobrando la oferta
                          </div>
                        )}
                      </td>
                      <td>{f.unidad_nombre}</td>
                      <td>{formatoPrecio(f.precio_actual)}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={valor}
                          placeholder={String(f.precio_actual)}
                          onChange={(e) => cambiarPrecio(f.unidad_venta_id, e.target.value)}
                          aria-invalid={invalido}
                          style={{ width: 120, borderColor: invalido ? 'var(--color-error)' : undefined }}
                        />
                      </td>
                      <td className={variacion === null ? undefined : variacion >= 0 ? 'reportes-costo-bajo' : 'reportes-costo-subio'}>
                        {variacion === null ? '—' : `${variacion >= 0 ? '+' : ''}${variacion.toFixed(1)}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* d) Confirmación */}
        <div className="staff-modal-pie">
          {error && <p className="staff-mensaje-error" style={{ margin: 0 }}>{error}</p>}
          {hayInvalidos && <p className="staff-mensaje-error" style={{ margin: 0 }}>Hay precios inválidos (tienen que ser mayores a 0).</p>}
          <span style={{ marginRight: 'auto', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
            {cambios.length === 0
              ? 'Sin cambios pendientes'
              : `${cambios.length} ${cambios.length === 1 ? 'precio modificado' : 'precios modificados'}${
                  cambiosFueraDelFiltro > 0 ? ` (${cambiosFueraDelFiltro} fuera del filtro actual)` : ''
                }`}
          </span>
          <button
            type="button"
            className="staff-btn staff-btn-secundario"
            onClick={descartarCambios}
            disabled={cambios.length === 0 || guardando}
          >
            Descartar cambios
          </button>
          <button
            type="button"
            className="staff-btn staff-btn-exito"
            onClick={confirmar}
            disabled={cambios.length === 0 || hayInvalidos || guardando}
          >
            {guardando ? 'Guardando...' : `Confirmar ${cambios.length || ''} cambios`}
          </button>
        </div>
      </div>
    </div>
  )
}
