import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { SUCURSAL_ID } from '../config/sucursal'

const UNIDADES_COMUNES = ['Kilo', 'Unidad', 'Docena', 'Bandeja', 'Atado', 'Bolsa', 'Cajón']

const FILTROS = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'activos', etiqueta: 'Activos' },
  { valor: 'eliminados', etiqueta: 'Eliminados' },
  { valor: 'stock_bajo', etiqueta: 'Stock bajo' },
]

// Se calcula siempre al vuelo a partir de los dos números actuales -- nunca
// se guarda como campo aparte, para no tener que mantenerlo sincronizado a
// mano en cada compra/venta/transformación (mismo criterio que el saldo de
// clientes_fiados/proveedores).
function esStockBajo(producto) {
  return Number(producto.stock_actual_unidad_base) < Number(producto.stock_minimo)
}

// costo_vigente queda en 0 acá: el formulario (tanto al crear un producto
// como al editarlo) no tiene ningún campo de costo -- se actualiza solo al
// confirmar una compra a proveedor (ver confirmar_pedido_compra / Compras.jsx).
// Toda unidad de venta nueva arranca en costo 0 hasta la primera compra que
// la incluya.
function filaVacia() {
  return { id: null, nombre_unidad: '', factor_conversion_base: 1, costo_vigente: 0, precio_venta: 0 }
}

export function Productos() {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('todos')

  const [mostrarForm, setMostrarForm] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [nombre, setNombre] = useState('')
  const [stockInicial, setStockInicial] = useState('')
  const [stockMinimo, setStockMinimo] = useState('')
  const [unidades, setUnidades] = useState([filaVacia()])
  const [unidadesEliminadas, setUnidadesEliminadas] = useState([])

  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  async function fetchProductos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('productos')
      .select('*, unidades_venta_producto(*)')
      .order('nombre')

    if (error) setError(error)
    else setProductos(data)
    setLoading(false)
  }

  async function cambiarActivo(producto) {
    setMensaje(null)
    const { error } = await supabase
      .from('productos')
      .update({ activo: !producto.activo })
      .eq('id', producto.id)

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }
    fetchProductos()
  }

  useEffect(() => {
    fetchProductos()
  }, [])

  const productosFiltrados = useMemo(() => {
    switch (filtro) {
      case 'activos':
        return productos.filter((p) => p.activo !== false)
      case 'eliminados':
        return productos.filter((p) => p.activo === false)
      case 'stock_bajo':
        return productos.filter(esStockBajo)
      default:
        return productos
    }
  }, [productos, filtro])

  function resetForm() {
    setEditandoId(null)
    setNombre('')
    setStockInicial('')
    setStockMinimo('')
    setUnidades([filaVacia()])
    setUnidadesEliminadas([])
    setMensaje(null)
  }

  function abrirNuevo() {
    resetForm()
    setMostrarForm(true)
  }

  function editarProducto(producto) {
    setEditandoId(producto.id)
    setNombre(producto.nombre)
    setStockInicial(String(producto.stock_actual_unidad_base ?? ''))
    setStockMinimo(String(producto.stock_minimo ?? ''))
    setUnidades(
      producto.unidades_venta_producto.map((u) => ({
        id: u.id,
        nombre_unidad: u.nombre_unidad,
        factor_conversion_base: u.factor_conversion_base,
        costo_vigente: u.costo_vigente,
        precio_venta: u.precio_venta,
      })),
    )
    setUnidadesEliminadas([])
    setMensaje(null)
    setMostrarForm(true)
  }

  function agregarFilaUnidad() {
    setUnidades((prev) => [...prev, filaVacia()])
  }

  function actualizarFilaUnidad(index, campo, valor) {
    setUnidades((prev) =>
      prev.map((u, i) => (i === index ? { ...u, [campo]: valor } : u)),
    )
  }

  function quitarFilaUnidad(index) {
    setUnidades((prev) => {
      const fila = prev[index]
      if (fila.id) setUnidadesEliminadas((elim) => [...elim, fila.id])
      return prev.filter((_, i) => i !== index)
    })
  }

  async function guardarProducto() {
    setMensaje(null)

    if (!nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'Falta el nombre del producto.' })
      return
    }

    const unidadesValidas = unidades.filter((u) => u.nombre_unidad.trim() && u.precio_venta !== '')

    if (unidadesValidas.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Agregá al menos una unidad de venta con nombre y precio.' })
      return
    }

    setGuardando(true)

    if (editandoId) {
      const { error: errorProducto } = await supabase
        .from('productos')
        .update({
          nombre: nombre.trim(),
          stock_actual_unidad_base: Number(stockInicial) || 0,
          stock_minimo: Number(stockMinimo) || 0,
        })
        .eq('id', editandoId)

      if (errorProducto) {
        setGuardando(false)
        setMensaje({ tipo: 'error', texto: errorProducto.message })
        return
      }

      const nuevas = unidadesValidas.filter((u) => !u.id)
      const existentes = unidadesValidas.filter((u) => u.id)

      const operaciones = []

      if (nuevas.length > 0) {
        operaciones.push(
          supabase
            .from('unidades_venta_producto')
            .insert(nuevas.map(({ id, ...u }) => ({ ...u, producto_id: editandoId }))),
        )
      }

      for (const u of existentes) {
        operaciones.push(
          supabase
            .from('unidades_venta_producto')
            .update({
              nombre_unidad: u.nombre_unidad,
              factor_conversion_base: Number(u.factor_conversion_base),
              costo_vigente: Number(u.costo_vigente),
              precio_venta: Number(u.precio_venta),
            })
            .eq('id', u.id),
        )
      }

      if (unidadesEliminadas.length > 0) {
        operaciones.push(
          supabase.from('unidades_venta_producto').delete().in('id', unidadesEliminadas),
        )
      }

      const resultados = await Promise.all(operaciones)
      const conError = resultados.find((r) => r.error)

      setGuardando(false)

      if (conError) {
        setMensaje({ tipo: 'error', texto: conError.error.message })
        return
      }

      setMensaje({ tipo: 'exito', texto: 'Producto actualizado.' })
      resetForm()
      setMostrarForm(false)
      fetchProductos()
      return
    }

    const { data: producto, error: errorProducto } = await supabase
      .from('productos')
      .insert({
        nombre: nombre.trim(),
        sucursal_id: SUCURSAL_ID,
        stock_actual_unidad_base: Number(stockInicial) || 0,
        stock_minimo: Number(stockMinimo) || 0,
      })
      .select()
      .single()

    if (errorProducto) {
      setGuardando(false)
      setMensaje({ tipo: 'error', texto: errorProducto.message })
      return
    }

    const { error: errorUnidades } = await supabase.from('unidades_venta_producto').insert(
      unidadesValidas.map(({ id, ...u }) => ({
        ...u,
        factor_conversion_base: Number(u.factor_conversion_base),
        costo_vigente: Number(u.costo_vigente),
        precio_venta: Number(u.precio_venta),
        producto_id: producto.id,
      })),
    )

    setGuardando(false)

    if (errorUnidades) {
      setMensaje({
        tipo: 'error',
        texto: `El producto se creó, pero falló al cargar las unidades: ${errorUnidades.message}`,
      })
      return
    }

    setMensaje({ tipo: 'exito', texto: `Producto "${producto.nombre}" creado — ya está visible en la tienda online.` })
    resetForm()
    setMostrarForm(false)
    fetchProductos()
  }

  return (
    <div>
      <h1>Productos</h1>

      <div className="staff-card">
        <button
          type="button"
          className="staff-btn"
          onClick={() => {
            if (mostrarForm) {
              resetForm()
              setMostrarForm(false)
            } else {
              abrirNuevo()
            }
          }}
        >
          {mostrarForm ? 'Cancelar' : '+ Nuevo producto'}
        </button>

        {mostrarForm && (
          <div style={{ marginTop: '1rem' }}>
            {editandoId && <p className="staff-badge staff-badge-pendiente">Editando producto existente</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem', maxWidth: 360 }}>
              <label>
                <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Nombre del producto</div>
                <input
                  type="text"
                  placeholder="Ej: Carne picada"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  style={{ width: '100%' }}
                />
              </label>
              <label>
                <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Stock</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem' }}>
                  Acá va la cantidad de stock que tenés ahora mismo (cuánto hay hoy, no un mínimo ni una meta).
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Cantidad de stock"
                  value={stockInicial}
                  onChange={(e) => setStockInicial(e.target.value)}
                  style={{ width: 160 }}
                />
              </label>
              <label>
                <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Stock mínimo</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem' }}>
                  A partir de qué cantidad se considera "poco" este producto. Cuando el stock
                  actual quede por debajo de este número, el producto se va a marcar en rojo acá
                  y se va a bloquear la compra en la tienda online (el cajero puede seguir
                  vendiéndolo sin problema).
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ej: 5"
                  value={stockMinimo}
                  onChange={(e) => setStockMinimo(e.target.value)}
                  style={{ width: 160 }}
                />
              </label>
            </div>

            <h2>Unidades de venta</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              El costo no se carga acá — arranca en 0 y se actualiza solo cuando confirmás una
              compra a proveedor (pantalla Compras).
            </p>
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Factor</th>
                  <th>Precio</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {unidades.map((u, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        value={u.nombre_unidad}
                        onChange={(e) => actualizarFilaUnidad(i, 'nombre_unidad', e.target.value)}
                      >
                        <option value="">Unidad...</option>
                        {UNIDADES_COMUNES.map((nombreUnidad) => (
                          <option key={nombreUnidad} value={nombreUnidad}>
                            {nombreUnidad}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={u.factor_conversion_base}
                        onChange={(e) => actualizarFilaUnidad(i, 'factor_conversion_base', e.target.value)}
                        style={{ width: 80 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={u.precio_venta}
                        onChange={(e) => actualizarFilaUnidad(i, 'precio_venta', e.target.value)}
                        style={{ width: 90 }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="staff-btn staff-btn-secundario"
                        onClick={() => quitarFilaUnidad(i)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="staff-btn staff-btn-secundario" onClick={agregarFilaUnidad} style={{ marginTop: '0.5rem' }}>
              + Otra unidad
            </button>

            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
              El "factor" indica cuánto stock consume 1 unidad vendida (ej: si el stock se mide
              en kilos y la unidad es "Kilo", el factor es 1).
            </p>

            {mensaje && (
              <p className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'} style={{ marginTop: '0.75rem' }}>
                {mensaje.texto}
              </p>
            )}

            <button type="button" className="staff-btn" onClick={guardarProducto} disabled={guardando} style={{ marginTop: '0.75rem' }}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar producto'}
            </button>
          </div>
        )}
      </div>

      {loading && <p>Cargando productos...</p>}

      {error && (
        <div className="staff-card">
          <h2>Error al consultar Supabase</h2>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}

      {!loading && !error && (
        <div className="staff-card">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                type="button"
                className={`staff-btn${filtro === f.valor ? '' : ' staff-btn-secundario'}`}
                onClick={() => setFiltro(f.valor)}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>

          {productosFiltrados.length === 0 && <p>No hay productos para este filtro.</p>}
          {productosFiltrados.length > 0 && (
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock</th>
                  <th>Unidades de venta</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map((producto) => {
                  const bajo = esStockBajo(producto)
                  return (
                  <tr
                    key={producto.id}
                    style={{
                      opacity: producto.activo === false ? 0.55 : 1,
                      background: bajo ? '#f6dcd6' : undefined,
                      boxShadow: bajo ? 'inset 3px 0 0 var(--color-error)' : undefined,
                    }}
                  >
                    <td>{producto.nombre}</td>
                    <td>{producto.stock_actual_unidad_base}</td>
                    <td>
                      {producto.unidades_venta_producto?.map((unidad) => (
                        <div key={unidad.id}>
                          {unidad.nombre_unidad} — ${unidad.precio_venta}
                        </div>
                      ))}
                    </td>
                    <td>
                      <span className={`staff-badge ${producto.activo === false ? 'staff-badge-cancelado' : 'staff-badge-pagado'}`}>
                        {producto.activo === false ? 'Eliminado' : 'Activo'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="staff-btn staff-btn-secundario"
                        onClick={() => editarProducto(producto)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="staff-btn staff-btn-secundario"
                        onClick={() => cambiarActivo(producto)}
                      >
                        {producto.activo === false ? 'Reactivar' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
