import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export function CompraProveedor() {
  const { usuario } = useAuth()

  const [sucursales, setSucursales] = useState([])
  const [sucursalId, setSucursalId] = useState('')

  const [productos, setProductos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [proveedorId, setProveedorId] = useState('')

  const [loadingCatalogo, setLoadingCatalogo] = useState(true)
  const [catalogoError, setCatalogoError] = useState(null)

  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState('')
  const [unidadSeleccionadaId, setUnidadSeleccionadaId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [costoUnitario, setCostoUnitario] = useState('')

  const [carrito, setCarrito] = useState([])

  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  useEffect(() => {
    if (usuario?.sucursal_id) setSucursalId(usuario.sucursal_id)
  }, [usuario])

  useEffect(() => {
    async function fetchCatalogo() {
      setLoadingCatalogo(true)
      const [productosRes, sucursalesRes] = await Promise.all([
        supabase.from('productos').select('*, unidades_venta_producto(*)').eq('activo', true),
        supabase.from('sucursales').select('*'),
      ])

      if (productosRes.error) setCatalogoError(productosRes.error)
      else if (sucursalesRes.error) setCatalogoError(sucursalesRes.error)
      else {
        setProductos(productosRes.data)
        setSucursales(sucursalesRes.data)
      }
      setLoadingCatalogo(false)
    }

    fetchCatalogo()
  }, [])

  useEffect(() => {
    if (!sucursalId) {
      setProveedores([])
      return
    }
    supabase
      .from('proveedores')
      .select('*')
      .eq('sucursal_id', sucursalId)
      .then(({ data, error }) => {
        if (error) setCatalogoError(error)
        else setProveedores(data)
      })
  }, [sucursalId])

  const productoSeleccionado = productos.find((p) => p.id === productoSeleccionadoId)
  const unidadesDisponibles = productoSeleccionado?.unidades_venta_producto ?? []
  const unidadSeleccionada = unidadesDisponibles.find((u) => u.id === unidadSeleccionadaId)

  function agregarItem() {
    if (
      !productoSeleccionado ||
      !unidadSeleccionada ||
      !cantidad ||
      Number(cantidad) <= 0 ||
      !costoUnitario ||
      Number(costoUnitario) < 0
    ) {
      setMensaje({ tipo: 'error', texto: 'Elegí producto, unidad, cantidad y costo válidos.' })
      return
    }

    setCarrito((prev) => [
      ...prev,
      {
        key: `${productoSeleccionado.id}-${unidadSeleccionada.id}-${Date.now()}`,
        producto_id: productoSeleccionado.id,
        producto_nombre: productoSeleccionado.nombre,
        unidad_venta_id: unidadSeleccionada.id,
        unidad_nombre: unidadSeleccionada.nombre_unidad,
        cantidad: Number(cantidad),
        costo_unitario: Number(costoUnitario),
      },
    ])
    setProductoSeleccionadoId('')
    setUnidadSeleccionadaId('')
    setCantidad('')
    setCostoUnitario('')
    setMensaje(null)
  }

  function quitarItem(key) {
    setCarrito((prev) => prev.filter((item) => item.key !== key))
  }

  const montoTotal = useMemo(
    () => carrito.reduce((acc, item) => acc + item.cantidad * item.costo_unitario, 0),
    [carrito],
  )

  async function confirmarCompra() {
    setMensaje(null)

    if (!sucursalId) {
      setMensaje({ tipo: 'error', texto: 'Seleccioná la sucursal.' })
      return
    }
    if (!proveedorId) {
      setMensaje({ tipo: 'error', texto: 'Seleccioná el proveedor.' })
      return
    }
    if (carrito.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Agregá al menos un ítem a la compra.' })
      return
    }

    setEnviando(true)

    const { data, error } = await supabase.rpc('registrar_compra', {
      p_sucursal_id: sucursalId,
      p_proveedor_id: proveedorId,
      p_items: carrito.map((item) => ({
        producto_id: item.producto_id,
        unidad_venta_id: item.unidad_venta_id,
        cantidad: item.cantidad,
        costo_unitario: item.costo_unitario,
      })),
    })

    setEnviando(false)

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }

    setMensaje({ tipo: 'exito', texto: `Compra registrada (id ${data}).` })
    setCarrito([])
  }

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
    <div style={{ maxWidth: 760 }}>
      <h1>Compra a proveedor</h1>

      <div className="staff-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
        {!usuario?.sucursal_id && (
          <label>
            Sucursal:{' '}
            <select
              value={sucursalId}
              onChange={(e) => {
                setSucursalId(e.target.value)
                setProveedorId('')
              }}
            >
              <option value="">Seleccionar...</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

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

      <div className="staff-card">
        <h2>Agregar producto</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <select
            value={productoSeleccionadoId}
            onChange={(e) => {
              setProductoSeleccionadoId(e.target.value)
              setUnidadSeleccionadaId('')
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
            value={unidadSeleccionadaId}
            onChange={(e) => setUnidadSeleccionadaId(e.target.value)}
            disabled={!productoSeleccionado}
          >
            <option value="">Unidad...</option>
            {unidadesDisponibles.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre_unidad} (costo actual: ${u.costo_vigente})
              </option>
            ))}
          </select>

          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            style={{ width: 100 }}
          />

          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Costo unitario"
            value={costoUnitario}
            onChange={(e) => setCostoUnitario(e.target.value)}
            style={{ width: 120 }}
          />

          <button type="button" className="staff-btn" onClick={agregarItem}>
            Agregar
          </button>
        </div>
      </div>

      <div className="staff-card">
        <h2>Ítems de la compra</h2>
        {carrito.length === 0 && <p>Sin ítems todavía.</p>}
        {carrito.length > 0 && (
          <table className="staff-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Unidad</th>
                <th>Cant.</th>
                <th>Costo unit.</th>
                <th>Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {carrito.map((item) => (
                <tr key={item.key}>
                  <td>{item.producto_nombre}</td>
                  <td>{item.unidad_nombre}</td>
                  <td>{item.cantidad}</td>
                  <td>${item.costo_unitario.toFixed(2)}</td>
                  <td>${(item.cantidad * item.costo_unitario).toFixed(2)}</td>
                  <td>
                    <button
                      type="button"
                      className="staff-btn staff-btn-secundario"
                      onClick={() => quitarItem(item.key)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="staff-total" style={{ marginTop: '0.75rem' }}>
          Monto total: ${montoTotal.toFixed(2)}
        </p>
      </div>

      {mensaje && (
        <p className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'}>
          {mensaje.texto}
        </p>
      )}

      <button type="button" className="staff-btn" onClick={confirmarCompra} disabled={enviando}>
        {enviando ? 'Registrando...' : 'Confirmar compra'}
      </button>
    </div>
  )
}
