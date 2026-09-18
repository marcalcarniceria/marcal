import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { SUCURSAL_ID } from '../config/sucursal'

// Para armar líneas de pedido a partir de una plantilla de despiece (sin
// costo todavía) hace falta elegir alguna unidad de venta del producto
// destino para mostrar/guardar la cantidad — se usa la más cercana a
// factor 1 ("un kilo"), mismo criterio que usa registrar_compra_por_plantilla
// en el servidor.
function unidadKiloDe(producto) {
  const unidades = producto?.unidades_venta_producto ?? []
  if (unidades.length === 0) return null
  return [...unidades].sort(
    (a, b) => Math.abs(a.factor_conversion_base - 1) - Math.abs(b.factor_conversion_base - 1),
  )[0]
}

function resumenDetalle(detalle) {
  if (!detalle || detalle.length === 0) return '—'
  const texto = detalle.map((d) => `${d.productos?.nombre ?? '—'} x${d.cantidad}`).join(', ')
  return texto.length > 70 ? `${texto.slice(0, 70)}…` : texto
}

const FILAS_POR_PAGINA = 20

export function CompraProveedor() {
  const location = useLocation()
  const navigate = useNavigate()

  const [productos, setProductos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [proveedorId, setProveedorId] = useState('')
  const [plantillas, setPlantillas] = useState([])

  const [loadingCatalogo, setLoadingCatalogo] = useState(true)
  const [catalogoError, setCatalogoError] = useState(null)

  // ---------- Columna izquierda: Pedido (sin precio) ----------
  const [pedidoItems, setPedidoItems] = useState([])
  const [modoPedido, setModoPedido] = useState('manual')
  const [pedidoProductoId, setPedidoProductoId] = useState('')
  const [pedidoUnidadId, setPedidoUnidadId] = useState('')
  const [pedidoCantidad, setPedidoCantidad] = useState('')
  const [plantillaPedidoId, setPlantillaPedidoId] = useState('')
  const [pesoTotalPedido, setPesoTotalPedido] = useState('')
  const [cargandoRepetir, setCargandoRepetir] = useState(false)
  const [enviandoPedido, setEnviandoPedido] = useState(false)
  const [mensajePedido, setMensajePedido] = useState(null)

  // ---------- Columna derecha: grilla de compras ----------
  const [compras, setCompras] = useState([])
  const [loadingCompras, setLoadingCompras] = useState(true)
  const [errorCompras, setErrorCompras] = useState(null)
  const [compraPagina, setCompraPagina] = useState(0)
  const [compraTotalFilas, setCompraTotalFilas] = useState(0)

  // ---------- Sidebar de confirmación ----------
  const [sidebarAbierto, setSidebarAbierto] = useState(false)
  const [sidebarCompraId, setSidebarCompraId] = useState(null)
  const [sidebarProveedorNombre, setSidebarProveedorNombre] = useState('')
  const [sidebarItems, setSidebarItems] = useState([])
  const [sidebarCargando, setSidebarCargando] = useState(false)
  const [sidebarProductoId, setSidebarProductoId] = useState('')
  const [sidebarUnidadId, setSidebarUnidadId] = useState('')
  const [sidebarCantidad, setSidebarCantidad] = useState('')
  const [sidebarEnviando, setSidebarEnviando] = useState(false)
  const [sidebarMensaje, setSidebarMensaje] = useState(null)

  useEffect(() => {
    async function fetchCatalogo() {
      setLoadingCatalogo(true)
      const [productosRes, proveedoresRes, plantillasRes] = await Promise.all([
        supabase.from('productos').select('*, unidades_venta_producto(*)').eq('activo', true),
        supabase.from('proveedores').select('*').eq('sucursal_id', SUCURSAL_ID),
        supabase
          .from('plantillas_despiece')
          .select('id, nombre, plantillas_despiece_detalle(porcentaje_rendimiento, producto_destino_id, productos(nombre))')
          .order('nombre'),
      ])

      if (productosRes.error) setCatalogoError(productosRes.error)
      else if (proveedoresRes.error) setCatalogoError(proveedoresRes.error)
      else if (plantillasRes.error) setCatalogoError(plantillasRes.error)
      else {
        setProductos(productosRes.data)
        setProveedores(proveedoresRes.data)
        setPlantillas(plantillasRes.data)
      }
      setLoadingCatalogo(false)
    }

    fetchCatalogo()
  }, [])

  async function fetchCompras() {
    setLoadingCompras(true)

    const desdeFila = compraPagina * FILAS_POR_PAGINA

    const { data, error, count } = await supabase
      .from('compras_proveedor')
      .select('id, fecha, estado, proveedores(nombre), detalle_compras(cantidad, productos(nombre))', { count: 'exact' })
      .eq('sucursal_id', SUCURSAL_ID)
      .order('fecha', { ascending: false })
      .range(desdeFila, desdeFila + FILAS_POR_PAGINA - 1)

    if (error) setErrorCompras(error)
    else {
      setCompras(data)
      setCompraTotalFilas(count ?? 0)
    }
    setLoadingCompras(false)
  }

  useEffect(() => {
    fetchCompras()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compraPagina])

  const compraHaySiguiente = (compraPagina + 1) * FILAS_POR_PAGINA < compraTotalFilas

  // Precarga desde "Repetir última compra" (Proveedores.jsx): llega por
  // location.state para no depender de una tabla/ruta nueva. Se limpia
  // el state después de aplicarlo para que un refresh no lo vuelva a
  // pisar. Siempre alimenta el Pedido (columna izquierda, sin precio) —
  // nunca escribe en la base por sí sola.
  useEffect(() => {
    if (location.state?.pedidoInicial) {
      setPedidoItems(location.state.pedidoInicial)
      if (location.state.proveedorId) setProveedorId(location.state.proveedorId)
      setMensajePedido({
        tipo: 'exito',
        texto: 'Se precargó la última compra a este proveedor como base del pedido.',
      })
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // =========================================================
  // Columna izquierda: Pedido
  // =========================================================

  const pedidoProducto = productos.find((p) => p.id === pedidoProductoId)
  const pedidoUnidadesDisponibles = pedidoProducto?.unidades_venta_producto ?? []
  const pedidoUnidad = pedidoUnidadesDisponibles.find((u) => u.id === pedidoUnidadId)

  function agregarItemPedido() {
    if (!pedidoProducto || !pedidoUnidad || !pedidoCantidad || Number(pedidoCantidad) <= 0) {
      setMensajePedido({ tipo: 'error', texto: 'Elegí producto, unidad y cantidad válidos.' })
      return
    }

    setPedidoItems((prev) => [
      ...prev,
      {
        key: `${pedidoProducto.id}-${pedidoUnidad.id}-${Date.now()}`,
        producto_id: pedidoProducto.id,
        producto_nombre: pedidoProducto.nombre,
        unidad_venta_id: pedidoUnidad.id,
        unidad_nombre: pedidoUnidad.nombre_unidad,
        cantidad: Number(pedidoCantidad),
      },
    ])
    setPedidoProductoId('')
    setPedidoUnidadId('')
    setPedidoCantidad('')
    setMensajePedido(null)
  }

  function quitarItemPedido(key) {
    setPedidoItems((prev) => prev.filter((item) => item.key !== key))
  }

  function actualizarItemPedido(key, valor) {
    setPedidoItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, cantidad: Number(valor) || 0 } : item)),
    )
  }

  const plantillaPedidoSeleccionada = plantillas.find((p) => p.id === plantillaPedidoId)
  const previewPedidoPlantilla =
    plantillaPedidoSeleccionada && Number(pesoTotalPedido) > 0
      ? plantillaPedidoSeleccionada.plantillas_despiece_detalle.map((d) => ({
          producto_destino_id: d.producto_destino_id,
          producto_nombre: d.productos?.nombre ?? '—',
          porcentaje: d.porcentaje_rendimiento,
          cantidad: (Number(pesoTotalPedido) * d.porcentaje_rendimiento) / 100,
        }))
      : []

  function agregarPlantillaAlPedido() {
    if (previewPedidoPlantilla.length === 0) {
      setMensajePedido({ tipo: 'error', texto: 'Elegí una plantilla e ingresá el peso total.' })
      return
    }

    const nuevasLineas = previewPedidoPlantilla.map((linea, i) => {
      const producto = productos.find((p) => p.id === linea.producto_destino_id)
      const unidad = unidadKiloDe(producto)
      return {
        key: `${linea.producto_destino_id}-${unidad?.id ?? 'sin-unidad'}-${Date.now()}-${i}`,
        producto_id: linea.producto_destino_id,
        producto_nombre: linea.producto_nombre,
        unidad_venta_id: unidad?.id ?? '',
        unidad_nombre: unidad?.nombre_unidad ?? 'Kilo',
        cantidad: Math.round(linea.cantidad * 1000) / 1000,
      }
    })

    setPedidoItems((prev) => [...prev, ...nuevasLineas])
    setPlantillaPedidoId('')
    setPesoTotalPedido('')
    setMensajePedido(null)
  }

  async function repetirCompraAnteriorPedido() {
    if (!proveedorId) {
      setMensajePedido({ tipo: 'error', texto: 'Seleccioná el proveedor primero.' })
      return
    }

    setMensajePedido(null)
    setCargandoRepetir(true)

    const { data: ultimaCompra, error: errorCompra } = await supabase
      .from('compras_proveedor')
      .select('id')
      .eq('proveedor_id', proveedorId)
      .eq('sucursal_id', SUCURSAL_ID)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (errorCompra || !ultimaCompra) {
      setCargandoRepetir(false)
      setMensajePedido({
        tipo: 'error',
        texto: errorCompra?.message ?? 'No se encontró ninguna compra previa a este proveedor.',
      })
      return
    }

    const { data: detalle, error: errorDetalle } = await supabase
      .from('detalle_compras')
      .select('producto_id, unidad_venta_id, cantidad, productos(nombre), unidades_venta_producto(nombre_unidad)')
      .eq('compra_id', ultimaCompra.id)

    setCargandoRepetir(false)

    if (errorDetalle) {
      setMensajePedido({ tipo: 'error', texto: errorDetalle.message })
      return
    }

    setPedidoItems(
      detalle.map((d, i) => ({
        key: `${d.producto_id}-${d.unidad_venta_id}-${i}-${Date.now()}`,
        producto_id: d.producto_id,
        producto_nombre: d.productos?.nombre ?? '—',
        unidad_venta_id: d.unidad_venta_id,
        unidad_nombre: d.unidades_venta_producto?.nombre_unidad ?? '—',
        cantidad: Number(d.cantidad),
      })),
    )
    setMensajePedido({ tipo: 'exito', texto: 'Se precargó la última compra a este proveedor como base del pedido.' })
  }

  async function confirmarPedido() {
    setMensajePedido(null)

    if (!proveedorId) {
      setMensajePedido({ tipo: 'error', texto: 'Seleccioná el proveedor.' })
      return
    }
    if (pedidoItems.length === 0) {
      setMensajePedido({ tipo: 'error', texto: 'Agregá al menos un producto al pedido.' })
      return
    }

    setEnviandoPedido(true)

    const { data, error } = await supabase.rpc('crear_pedido_compra', {
      p_sucursal_id: SUCURSAL_ID,
      p_proveedor_id: proveedorId,
      p_items: pedidoItems.map((item) => ({
        producto_id: item.producto_id,
        unidad_venta_id: item.unidad_venta_id,
        cantidad: item.cantidad,
      })),
    })

    setEnviandoPedido(false)

    if (error) {
      setMensajePedido({ tipo: 'error', texto: error.message })
      return
    }

    setMensajePedido({ tipo: 'exito', texto: `Pedido registrado (id ${data}).` })
    setPedidoItems([])
    fetchCompras()
  }

  // =========================================================
  // Sidebar de confirmación (Editar / Confirmar de la grilla)
  // =========================================================

  async function abrirSidebar(compra) {
    setSidebarCompraId(compra.id)
    setSidebarProveedorNombre(compra.proveedores?.nombre ?? '—')
    setSidebarAbierto(true)
    setSidebarMensaje(null)
    setSidebarProductoId('')
    setSidebarUnidadId('')
    setSidebarCantidad('')
    setSidebarCargando(true)

    const { data, error } = await supabase
      .from('detalle_compras')
      .select('id, producto_id, unidad_venta_id, cantidad, costo_unitario, productos(nombre), unidades_venta_producto(nombre_unidad)')
      .eq('compra_id', compra.id)

    setSidebarCargando(false)

    if (error) {
      setSidebarMensaje({ tipo: 'error', texto: error.message })
      return
    }

    setSidebarItems(
      data.map((d) => ({
        key: `${d.id}`,
        producto_id: d.producto_id,
        producto_nombre: d.productos?.nombre ?? '—',
        unidad_venta_id: d.unidad_venta_id,
        unidad_nombre: d.unidades_venta_producto?.nombre_unidad ?? '—',
        cantidad: Number(d.cantidad),
        costo_unitario: d.costo_unitario !== null ? Number(d.costo_unitario) : '',
      })),
    )
  }

  function cerrarSidebar() {
    setSidebarAbierto(false)
    setSidebarCompraId(null)
    setSidebarItems([])
    setSidebarMensaje(null)
  }

  function actualizarLineaSidebar(key, campo, valor) {
    setSidebarItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [campo]: valor } : item)),
    )
  }

  function quitarLineaSidebar(key) {
    setSidebarItems((prev) => prev.filter((item) => item.key !== key))
  }

  const sidebarProducto = productos.find((p) => p.id === sidebarProductoId)
  const sidebarUnidadesDisponibles = sidebarProducto?.unidades_venta_producto ?? []
  const sidebarUnidad = sidebarUnidadesDisponibles.find((u) => u.id === sidebarUnidadId)

  function agregarLineaSidebar() {
    if (!sidebarProducto || !sidebarUnidad || !sidebarCantidad || Number(sidebarCantidad) <= 0) {
      setSidebarMensaje({ tipo: 'error', texto: 'Elegí producto, unidad y cantidad válidos.' })
      return
    }

    setSidebarItems((prev) => [
      ...prev,
      {
        key: `nuevo-${sidebarProducto.id}-${sidebarUnidad.id}-${Date.now()}`,
        producto_id: sidebarProducto.id,
        producto_nombre: sidebarProducto.nombre,
        unidad_venta_id: sidebarUnidad.id,
        unidad_nombre: sidebarUnidad.nombre_unidad,
        cantidad: Number(sidebarCantidad),
        costo_unitario: '',
      },
    ])
    setSidebarProductoId('')
    setSidebarUnidadId('')
    setSidebarCantidad('')
    setSidebarMensaje(null)
  }

  async function confirmarDesdeSidebar() {
    setSidebarMensaje(null)

    if (sidebarItems.length === 0) {
      setSidebarMensaje({ tipo: 'error', texto: 'Agregá al menos un producto.' })
      return
    }
    if (sidebarItems.some((item) => !item.costo_unitario || Number(item.costo_unitario) <= 0)) {
      setSidebarMensaje({ tipo: 'error', texto: 'Todas las líneas necesitan un precio mayor a cero.' })
      return
    }

    setSidebarEnviando(true)

    const { error } = await supabase.rpc('confirmar_pedido_compra', {
      p_compra_id: sidebarCompraId,
      p_items: sidebarItems.map((item) => ({
        producto_id: item.producto_id,
        unidad_venta_id: item.unidad_venta_id,
        cantidad: item.cantidad,
        costo_unitario: Number(item.costo_unitario),
      })),
    })

    setSidebarEnviando(false)

    if (error) {
      setSidebarMensaje({ tipo: 'error', texto: error.message })
      return
    }

    cerrarSidebar()
    fetchCompras()
  }

  const sidebarMontoTotal = useMemo(
    () => sidebarItems.reduce((acc, item) => acc + item.cantidad * (Number(item.costo_unitario) || 0), 0),
    [sidebarItems],
  )

  if (loadingCatalogo) return <p>Cargando catálogo...</p>

  if (catalogoError) {
    return (
      <div>
        <h2>Error al cargar el catálogo</h2>
        <pre>{JSON.stringify(catalogoError, null, 2)}</pre>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1300 }}>
      <h1>Compra a proveedor</h1>

      <div className="staff-card">
        <label>
          Proveedor:{' '}
          <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            <option value="">Seleccionar...</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* ============ Columna izquierda: Pedido ============ */}
        <div style={{ flex: '1 1 480px', minWidth: 340 }}>
          <h2 style={{ marginTop: 0 }}>Pedido</h2>

          {!proveedorId && <p>Elegí un proveedor para armar el pedido.</p>}

          {proveedorId && (
            <>
              <div className="staff-card">
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`staff-btn${modoPedido === 'manual' ? '' : ' staff-btn-secundario'}`}
                    onClick={() => setModoPedido('manual')}
                  >
                    Carga manual
                  </button>
                  <button
                    type="button"
                    className={`staff-btn${modoPedido === 'plantilla' ? '' : ' staff-btn-secundario'}`}
                    onClick={() => setModoPedido('plantilla')}
                  >
                    Plantilla de compra recurrente
                  </button>
                  <button
                    type="button"
                    className="staff-btn staff-btn-secundario"
                    onClick={repetirCompraAnteriorPedido}
                    disabled={cargandoRepetir}
                  >
                    {cargandoRepetir ? 'Cargando...' : 'Repetir compra anterior'}
                  </button>
                </div>

                {modoPedido === 'manual' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                    <select
                      value={pedidoProductoId}
                      onChange={(e) => {
                        setPedidoProductoId(e.target.value)
                        setPedidoUnidadId('')
                      }}
                    >
                      <option value="">Seleccionar producto...</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>

                    <select
                      value={pedidoUnidadId}
                      onChange={(e) => setPedidoUnidadId(e.target.value)}
                      disabled={!pedidoProducto}
                    >
                      <option value="">Unidad...</option>
                      {pedidoUnidadesDisponibles.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nombre_unidad}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Cantidad"
                      value={pedidoCantidad}
                      onChange={(e) => setPedidoCantidad(e.target.value)}
                      style={{ width: 100 }}
                    />

                    <button type="button" className="staff-btn" onClick={agregarItemPedido}>
                      Agregar
                    </button>
                  </div>
                )}

                {modoPedido === 'plantilla' && (
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                      <select value={plantillaPedidoId} onChange={(e) => setPlantillaPedidoId(e.target.value)}>
                        <option value="">Seleccionar plantilla...</option>
                        {plantillas.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Peso total (kg)"
                        value={pesoTotalPedido}
                        onChange={(e) => setPesoTotalPedido(e.target.value)}
                        style={{ width: 140 }}
                      />
                      <button type="button" className="staff-btn" onClick={agregarPlantillaAlPedido}>
                        Agregar al pedido
                      </button>
                    </div>
                    {plantillas.length === 0 && (
                      <p style={{ marginTop: '0.5rem', color: 'var(--color-text-muted)' }}>
                        Todavía no hay plantillas cargadas — creá una en "Plantillas de despiece".
                      </p>
                    )}
                    {previewPedidoPlantilla.length > 0 && (
                      <ul style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        {previewPedidoPlantilla.map((linea) => (
                          <li key={linea.producto_destino_id}>
                            {linea.producto_nombre}: {linea.cantidad.toFixed(3)} kg ({linea.porcentaje}%)
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="staff-card">
                <h2>Desglose del pedido</h2>
                {pedidoItems.length === 0 && <p>Sin ítems todavía.</p>}
                {pedidoItems.length > 0 && (
                  <table className="staff-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>Unidad</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidoItems.map((item) => (
                        <tr key={item.key}>
                          <td>{item.producto_nombre}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.cantidad}
                              onChange={(e) => actualizarItemPedido(item.key, e.target.value)}
                              style={{ width: 80 }}
                            />
                          </td>
                          <td>{item.unidad_nombre}</td>
                          <td>
                            <button
                              type="button"
                              className="staff-btn staff-btn-secundario"
                              onClick={() => quitarItemPedido(item.key)}
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {mensajePedido && (
                <p className={mensajePedido.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'}>
                  {mensajePedido.texto}
                </p>
              )}

              <button type="button" className="staff-btn" onClick={confirmarPedido} disabled={enviandoPedido}>
                {enviandoPedido ? 'Guardando...' : 'Confirmar pedido'}
              </button>
            </>
          )}
        </div>

        {/* ============ Columna derecha: grilla de compras ============ */}
        <div style={{ flex: '1 1 560px', minWidth: 380 }}>
          <h2 style={{ marginTop: 0 }}>Compras</h2>

          {errorCompras && (
            <div className="staff-card">
              <h2>Error al consultar Supabase</h2>
              <pre>{JSON.stringify(errorCompras, null, 2)}</pre>
            </div>
          )}

          {loadingCompras && <p>Cargando...</p>}

          {!loadingCompras && !errorCompras && (
            <div className="staff-card">
              {compras.length === 0 && <p>No hay compras registradas.</p>}
              {compras.length > 0 && (
                <>
                  <table className="staff-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Proveedor</th>
                        <th>Estado</th>
                        <th>Detalle</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {compras.map((c) => (
                        <tr key={c.id}>
                          <td>{new Date(c.fecha).toLocaleDateString('es-AR')}</td>
                          <td>{c.proveedores?.nombre ?? '—'}</td>
                          <td>
                            <span className={`staff-badge ${c.estado === 'confirmada' ? 'staff-badge-pagado' : 'staff-badge-pendiente'}`}>
                              {c.estado === 'confirmada' ? 'Confirmada' : 'Pedido'}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.85rem' }}>{resumenDetalle(c.detalle_compras)}</td>
                          <td>
                            {c.estado === 'pedido' && (
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <button type="button" className="staff-btn staff-btn-secundario" onClick={() => abrirSidebar(c)}>
                                  Editar
                                </button>
                                <button type="button" className="staff-btn" onClick={() => abrirSidebar(c)}>
                                  Confirmar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="staff-btn staff-btn-secundario"
                      onClick={() => setCompraPagina((p) => p - 1)}
                      disabled={compraPagina === 0}
                    >
                      ← Anterior
                    </button>
                    <span>Página {compraPagina + 1}</span>
                    <button
                      type="button"
                      className="staff-btn staff-btn-secundario"
                      onClick={() => setCompraPagina((p) => p + 1)}
                      disabled={!compraHaySiguiente}
                    >
                      Siguiente →
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ============ Sidebar de confirmación ============ */}
      {sidebarAbierto && (
        <div className="staff-drawer-overlay" onClick={cerrarSidebar}>
          <div className="staff-drawer" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Confirmar compra — {sidebarProveedorNombre}</h2>

            {sidebarCargando && <p>Cargando...</p>}

            {!sidebarCargando && (
              <>
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cant.</th>
                      <th>Precio</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sidebarItems.map((item) => (
                      <tr key={item.key}>
                        <td>
                          {item.producto_nombre}
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.unidad_nombre}</div>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.cantidad}
                            onChange={(e) => actualizarLineaSidebar(item.key, 'cantidad', Number(e.target.value) || 0)}
                            style={{ width: 70 }}
                          />
                        </td>
                        <td>
                          $
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Precio"
                            value={item.costo_unitario}
                            onChange={(e) => actualizarLineaSidebar(item.key, 'costo_unitario', e.target.value)}
                            style={{ width: 80 }}
                          />
                        </td>
                        <td>
                          <button type="button" className="staff-btn staff-btn-secundario" onClick={() => quitarLineaSidebar(item.key)}>
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="staff-total" style={{ marginTop: '0.5rem' }}>
                  Monto total: ${sidebarMontoTotal.toFixed(2)}
                </p>

                <h3>Agregar producto no pedido</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    value={sidebarProductoId}
                    onChange={(e) => {
                      setSidebarProductoId(e.target.value)
                      setSidebarUnidadId('')
                    }}
                  >
                    <option value="">Seleccionar producto...</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <select value={sidebarUnidadId} onChange={(e) => setSidebarUnidadId(e.target.value)} disabled={!sidebarProducto}>
                    <option value="">Unidad...</option>
                    {sidebarUnidadesDisponibles.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre_unidad}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Cantidad"
                    value={sidebarCantidad}
                    onChange={(e) => setSidebarCantidad(e.target.value)}
                    style={{ width: 90 }}
                  />
                  <button type="button" className="staff-btn staff-btn-secundario" onClick={agregarLineaSidebar}>
                    Agregar
                  </button>
                </div>

                {sidebarMensaje && (
                  <p className={sidebarMensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'} style={{ marginTop: '0.75rem' }}>
                    {sidebarMensaje.texto}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button type="button" className="staff-btn staff-btn-secundario" onClick={cerrarSidebar}>
                    Cancelar
                  </button>
                  <button type="button" className="staff-btn" onClick={confirmarDesdeSidebar} disabled={sidebarEnviando}>
                    {sidebarEnviando ? 'Confirmando...' : 'Confirmar compra'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
