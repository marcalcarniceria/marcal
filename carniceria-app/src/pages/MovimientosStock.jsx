import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { SUCURSAL_ID } from '../config/sucursal'

const FILAS_A_TRAER = 500
const FILAS_POR_PAGINA = 20

// Solo estos roles pueden cargar mermas/ingresos manuales -- coincide con la
// validación que ya hace rpc_registrar_ajuste_stock en el servidor (ver
// schema_movimientos_stock.sql). El cajero puede ver el historial pero no
// registrar ajustes.
const ROLES_PUEDEN_AJUSTAR = ['dueño', 'verdulero', 'carnicero']

const ORIGEN_LABEL = {
  detalle_ventas: 'Venta (mostrador)',
  detalle_pedidos: 'Pedido online',
  detalle_compras: 'Compra a proveedor',
  ajustes_stock: 'Ajuste manual',
}

// Los UUID/hashes largos (ej. "#bf9eb845-bd7f-4a2c-...") hacen ilegible la
// columna de motivo -- se truncan a los primeros 8 caracteres del hash.
const REGEX_HASH_LARGO = /\b([a-f0-9]{8})[a-f0-9-]{6,}\b/gi

function truncarReferencia(texto) {
  if (!texto) return texto
  return texto.replace(REGEX_HASH_LARGO, '$1…')
}

export function MovimientosStock() {
  const { usuario } = useAuth()
  console.log('[DEBUG MovimientosStock] usuario del AuthContext:', usuario)
  const rolNormalizado = usuario?.rol?.trim().toLowerCase()
  const puedeAjustar = ROLES_PUEDEN_AJUSTAR.includes(rolNormalizado)

  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ---------- Filtros (client-side, sin volver a pedir a Supabase) ----------
  const [filtroProducto, setFiltroProducto] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [pagina, setPagina] = useState(0)

  // ---------- Modal "Nuevo ajuste" ----------
  const [modalAbierto, setModalAbierto] = useState(false)
  const [productos, setProductos] = useState([])
  const [buscadorProducto, setBuscadorProducto] = useState('')
  const [productoId, setProductoId] = useState('')
  const [tipoAjuste, setTipoAjuste] = useState('salida')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensajeModal, setMensajeModal] = useState(null)

  const [toast, setToast] = useState(null)

  async function fetchMovimientos() {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('vw_historial_movimientos_stock')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(FILAS_A_TRAER)

    if (error) setError(error)
    else setMovimientos(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchMovimientos()
  }, [])

  // Mostrar el toast de éxito un rato y ocultarlo solo.
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const movimientosFiltrados = useMemo(() => {
    const desde = filtroDesde ? new Date(`${filtroDesde}T00:00:00`) : null
    const hasta = filtroHasta ? new Date(`${filtroHasta}T23:59:59.999`) : null
    const nombreBuscado = filtroProducto.trim().toLowerCase()

    return movimientos.filter((m) => {
      if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false
      if (nombreBuscado && !m.nombre_producto?.toLowerCase().includes(nombreBuscado)) return false

      const fechaMov = new Date(m.fecha)
      if (desde && fechaMov < desde) return false
      if (hasta && fechaMov > hasta) return false

      return true
    })
  }, [movimientos, filtroProducto, filtroTipo, filtroDesde, filtroHasta])

  // Volver a la primera página cada vez que cambia algún filtro -- si no, se
  // puede quedar "varado" en una página que ya no tiene filas.
  useEffect(() => {
    setPagina(0)
  }, [filtroProducto, filtroTipo, filtroDesde, filtroHasta])

  // Agrupación visual: cuando una venta/pedido/compra descuenta o suma varios
  // productos a la vez, esas filas comparten origen_tabla y motivo_o_referencia
  // (ej. "Venta #abc", "Pedido online #xyz") y quedan contiguas porque la vista
  // ya viene ordenada por fecha -- todas las líneas de una misma transacción
  // tienen exactamente el mismo timestamp. Se calcula sobre el array ya
  // filtrado (no sobre la página actual) para que el resultado no cambie según
  // dónde caiga el corte de paginación.
  const movimientosConGrupo = useMemo(() => {
    return movimientosFiltrados.map((m, i, arr) => {
      const claveDe = (x) => `${x.origen_tabla}::${x.motivo_o_referencia}`
      const anterior = arr[i - 1]
      const siguiente = arr[i + 1]
      const agrupadoArriba = Boolean(anterior && claveDe(anterior) === claveDe(m))
      const agrupadoAbajo = Boolean(siguiente && claveDe(siguiente) === claveDe(m))
      return { ...m, _agrupadoArriba: agrupadoArriba, _agrupadoAbajo: agrupadoAbajo }
    })
  }, [movimientosFiltrados])

  const totalFilas = movimientosConGrupo.length
  const haySiguiente = (pagina + 1) * FILAS_POR_PAGINA < totalFilas
  const movimientosPagina = movimientosConGrupo.slice(
    pagina * FILAS_POR_PAGINA,
    pagina * FILAS_POR_PAGINA + FILAS_POR_PAGINA,
  )

  // ---------- Modal ----------

  async function abrirModal(tipo) {
    setModalAbierto(true)
    setMensajeModal(null)
    setProductoId('')
    setBuscadorProducto('')
    setTipoAjuste(tipo)
    setCantidad('')
    setMotivo('')

    if (productos.length === 0) {
      const { data, error } = await supabase
        .from('productos')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre')

      if (error) setMensajeModal({ tipo: 'error', texto: error.message })
      else setProductos(data)
    }
  }

  function cerrarModal() {
    setModalAbierto(false)
  }

  const productosFiltrados = useMemo(() => {
    const buscado = buscadorProducto.trim().toLowerCase()
    if (!buscado) return productos
    return productos.filter((p) => p.nombre.toLowerCase().includes(buscado))
  }, [productos, buscadorProducto])

  async function confirmarAjuste() {
    setMensajeModal(null)

    if (!productoId) {
      setMensajeModal({ tipo: 'error', texto: 'Elegí un producto.' })
      return
    }
    if (!cantidad || Number(cantidad) <= 0) {
      setMensajeModal({ tipo: 'error', texto: 'La cantidad debe ser mayor a cero.' })
      return
    }
    if (!motivo.trim()) {
      setMensajeModal({ tipo: 'error', texto: 'El motivo es obligatorio, para mantener la auditoría clara.' })
      return
    }

    setEnviando(true)

    const { error } = await supabase.rpc('rpc_registrar_ajuste_stock', {
      p_producto_id: productoId,
      p_cantidad: Number(cantidad),
      p_tipo_movimiento: tipoAjuste,
      p_motivo: motivo.trim(),
      p_usuario_id: usuario.id,
      p_sucursal_id: SUCURSAL_ID,
    })

    setEnviando(false)

    if (error) {
      setToast({ tipo: 'error', texto: `No se pudo registrar el ajuste: ${error.message}` })
      return
    }

    cerrarModal()
    setToast({
      tipo: 'exito',
      texto: tipoAjuste === 'entrada' ? 'Ingreso de stock registrado correctamente.' : 'Egreso de stock registrado correctamente.',
    })
    fetchMovimientos()
  }

  const productoSeleccionado = productos.find((p) => p.id === productoId)

  return (
    <div style={{ maxWidth: 1100 }}>
      {toast && (
        <div className="staff-toast-stack" style={{ position: 'fixed' }}>
          <div className={`staff-toast staff-toast-${toast.tipo === 'error' ? 'error' : 'exito'}`} role="status">
            <p className="staff-toast-texto">{toast.texto}</p>
            <div className="staff-toast-acciones">
              <button type="button" className="staff-toast-cerrar" onClick={() => setToast(null)} aria-label="Cerrar notificación">
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h1>Movimientos de stock</h1>
        {puedeAjustar && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="staff-btn staff-btn-ingreso" onClick={() => abrirModal('entrada')}>
              ↑ Registrar Ingreso
            </button>
            <button type="button" className="staff-btn staff-btn-egreso" onClick={() => abrirModal('salida')}>
              ↓ Registrar Egreso
            </button>
          </div>
        )}
      </div>

      <div className="staff-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
        <label>
          Producto:{' '}
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={filtroProducto}
            onChange={(e) => setFiltroProducto(e.target.value)}
          />
        </label>
        <label>
          Desde:{' '}
          <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
        </label>
        <label>
          Hasta:{' '}
          <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={`staff-btn${filtroTipo === 'todos' ? '' : ' staff-btn-secundario'}`}
            onClick={() => setFiltroTipo('todos')}
          >
            Todos
          </button>
          <button
            type="button"
            className={`staff-btn${filtroTipo === 'entrada' ? '' : ' staff-btn-secundario'}`}
            onClick={() => setFiltroTipo('entrada')}
          >
            Entradas
          </button>
          <button
            type="button"
            className={`staff-btn${filtroTipo === 'salida' ? '' : ' staff-btn-secundario'}`}
            onClick={() => setFiltroTipo('salida')}
          >
            Salidas
          </button>
        </div>
      </div>

      {error && (
        <div className="staff-card">
          <h2>Error al consultar Supabase</h2>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}

      {loading && <p>Cargando...</p>}

      {!loading && !error && (
        <div className="staff-card">
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
            Mostrando {totalFilas === 0 ? 0 : pagina * FILAS_POR_PAGINA + 1}–
            {Math.min((pagina + 1) * FILAS_POR_PAGINA, totalFilas)} de {totalFilas} movimientos
            (últimos {movimientos.length} traídos).
          </p>

          {totalFilas === 0 && <p>No hay movimientos que coincidan con los filtros.</p>}

          {totalFilas > 0 && (
            <>
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Tipo</th>
                    <th>Cantidad</th>
                    <th>Origen</th>
                    <th>Motivo / Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientosPagina.map((m) => {
                    const claseGrupo = [
                      m._agrupadoArriba || m._agrupadoAbajo ? 'mov-stock-fila-agrupada' : '',
                      m._agrupadoAbajo ? 'mov-stock-sin-separador' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')

                    return (
                      <tr key={`${m.origen_tabla}-${m.id_movimiento}`} className={claseGrupo || undefined}>
                        <td>{new Date(m.fecha).toLocaleString('es-AR')}</td>
                        <td>{m.nombre_producto}</td>
                        <td className={m.tipo === 'entrada' ? 'movimientos-ingreso' : 'movimientos-egreso'}>
                          {m.tipo === 'entrada' ? '↑ Entrada' : '↓ Salida'}
                        </td>
                        <td>{Number(m.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 3 })}</td>
                        <td>{ORIGEN_LABEL[m.origen_tabla] ?? m.origen_tabla}</td>
                        <td title={m.motivo_o_referencia}>{truncarReferencia(m.motivo_o_referencia)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="staff-btn staff-btn-secundario"
                  onClick={() => setPagina((p) => p - 1)}
                  disabled={pagina === 0}
                >
                  ← Anterior
                </button>
                <span>Página {pagina + 1}</span>
                <button
                  type="button"
                  className="staff-btn staff-btn-secundario"
                  onClick={() => setPagina((p) => p + 1)}
                  disabled={!haySiguiente}
                >
                  Siguiente →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ Modal: Nuevo ajuste ============ */}
      {modalAbierto && (
        <div className="staff-drawer-overlay" onClick={cerrarModal}>
          <div className="staff-drawer" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>
              {tipoAjuste === 'entrada' ? 'Nuevo ingreso de stock' : 'Registro de merma / egreso'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label>
                Producto
                <br />
                <input
                  type="text"
                  placeholder="Buscar producto..."
                  value={buscadorProducto}
                  onChange={(e) => setBuscadorProducto(e.target.value)}
                  style={{ width: '100%', marginBottom: '0.35rem' }}
                />
                <select
                  value={productoId}
                  onChange={(e) => setProductoId(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">Seleccionar producto...</option>
                  {productosFiltrados.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Cantidad {productoSeleccionado ? `(${productoSeleccionado.nombre})` : ''}
                <br />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ej: 2.5"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  style={{ width: '100%' }}
                />
              </label>

              <label>
                Motivo / Referencia
                <br />
                <input
                  type="text"
                  required
                  placeholder={
                    tipoAjuste === 'entrada' ? 'Ej: Devolución de proveedor' : 'Ej: Merma por descomposición'
                  }
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  style={{ width: '100%' }}
                />
              </label>
            </div>

            {mensajeModal && (
              <p className={mensajeModal.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'} style={{ marginTop: '0.75rem' }}>
                {mensajeModal.texto}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button type="button" className="staff-btn staff-btn-secundario" onClick={cerrarModal}>
                Cancelar
              </button>
              <button type="button" className="staff-btn" onClick={confirmarAjuste} disabled={enviando}>
                {enviando ? 'Guardando...' : 'Registrar ajuste'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
