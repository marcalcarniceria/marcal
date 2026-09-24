import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { SUCURSAL_ID } from '../config/sucursal'

// Un combo no tiene stock propio: es una receta de productos físicos (ver
// schema_combos.sql). Cada ingrediente es producto + unidad de venta +
// cantidad en esa unidad (ej. 1.5 de "Kilo" de Carne picada).
function ingredienteVacio() {
  return { producto_id: '', unidad_venta_id: '', factor_cantidad: '' }
}

function formatoPrecio(valor) {
  return `$${Number(valor).toFixed(2)}`
}

export function AdminCombos() {
  const [combos, setCombos] = useState([])
  const [productos, setProductos] = useState([])
  // Stock virtual por combo (solo activos), de obtener_combos_tienda.
  const [stockPorCombo, setStockPorCombo] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [recarga, setRecarga] = useState(0)

  const [mostrarForm, setMostrarForm] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [precio, setPrecio] = useState('')
  const [imagenUrl, setImagenUrl] = useState('')
  const [ingredientes, setIngredientes] = useState([ingredienteVacio()])

  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase
        .from('combos')
        .select(
          '*, combo_ingredientes(id, producto_id, unidad_venta_id, factor_cantidad, productos(nombre), unidades_venta_producto(nombre_unidad))',
        )
        .eq('sucursal_id', SUCURSAL_ID)
        .order('nombre'),
      supabase
        .from('productos')
        .select('id, nombre, unidades_venta_producto(id, nombre_unidad, precio_venta)')
        .eq('sucursal_id', SUCURSAL_ID)
        .eq('activo', true)
        .order('nombre'),
      supabase.rpc('obtener_combos_tienda', { p_sucursal_id: SUCURSAL_ID }),
    ]).then(([combosRes, productosRes, stockRes]) => {
      const conError = [combosRes, productosRes, stockRes].find((r) => r.error)
      if (conError) {
        setError(conError.error)
      } else {
        setError(null)
        setCombos(combosRes.data)
        setProductos(productosRes.data)
        setStockPorCombo(Object.fromEntries(stockRes.data.map((c) => [c.id, c])))
      }
      setLoading(false)
    })
  }, [recarga])

  const productosPorId = useMemo(
    () => Object.fromEntries(productos.map((p) => [p.id, p])),
    [productos],
  )

  function unidadesDe(productoId) {
    return productosPorId[productoId]?.unidades_venta_producto ?? []
  }

  // Referencia para el dueño: lo que costaría armar el combo comprando cada
  // cosa suelta a precio normal. No se guarda ni se usa para cobrar.
  const valorSuelto = ingredientes.reduce((acc, ing) => {
    const unidad = unidadesDe(ing.producto_id).find((u) => u.id === ing.unidad_venta_id)
    return acc + (unidad ? Number(unidad.precio_venta) * (Number(ing.factor_cantidad) || 0) : 0)
  }, 0)

  function resetForm() {
    setEditandoId(null)
    setNombre('')
    setDescripcion('')
    setPrecio('')
    setImagenUrl('')
    setIngredientes([ingredienteVacio()])
    setMensaje(null)
  }

  function abrirNuevo() {
    resetForm()
    setMostrarForm(true)
  }

  function editarCombo(combo) {
    setEditandoId(combo.id)
    setNombre(combo.nombre)
    setDescripcion(combo.descripcion ?? '')
    setPrecio(String(combo.precio_fijo))
    setImagenUrl(combo.imagen_url ?? '')
    setIngredientes(
      combo.combo_ingredientes.length > 0
        ? combo.combo_ingredientes.map((ci) => ({
            producto_id: ci.producto_id,
            unidad_venta_id: ci.unidad_venta_id,
            factor_cantidad: String(ci.factor_cantidad),
          }))
        : [ingredienteVacio()],
    )
    setMensaje(null)
    setMostrarForm(true)
  }

  function agregarIngrediente() {
    setIngredientes((prev) => [...prev, ingredienteVacio()])
  }

  function quitarIngrediente(index) {
    setIngredientes((prev) => prev.filter((_, i) => i !== index))
  }

  function actualizarIngrediente(index, campo, valor) {
    setIngredientes((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing
        if (campo !== 'producto_id') return { ...ing, [campo]: valor }
        // Al cambiar de producto la unidad anterior deja de ser válida; si
        // el producto nuevo tiene una sola unidad, se elige sola.
        const unidades = unidadesDe(valor)
        return {
          ...ing,
          producto_id: valor,
          unidad_venta_id: unidades.length === 1 ? unidades[0].id : '',
        }
      }),
    )
  }

  async function guardarCombo() {
    setMensaje(null)

    if (!nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'Falta el nombre del combo.' })
      return
    }

    if (!(Number(precio) > 0)) {
      setMensaje({ tipo: 'error', texto: 'El precio del combo tiene que ser mayor a cero.' })
      return
    }

    const ingredientesValidos = ingredientes.filter(
      (ing) => ing.producto_id && ing.unidad_venta_id && Number(ing.factor_cantidad) > 0,
    )

    if (ingredientesValidos.length === 0) {
      setMensaje({
        tipo: 'error',
        texto: 'Agregá al menos un ingrediente con producto, unidad y cantidad.',
      })
      return
    }

    if (ingredientesValidos.length < ingredientes.length) {
      setMensaje({
        tipo: 'error',
        texto: 'Hay ingredientes incompletos: completalos o quitalos antes de guardar.',
      })
      return
    }

    setGuardando(true)
    const { error } = await supabase.rpc('guardar_combo', {
      p_combo_id: editandoId,
      p_sucursal_id: SUCURSAL_ID,
      p_nombre: nombre.trim(),
      p_descripcion: descripcion.trim() || null,
      p_precio_fijo: Number(precio),
      p_imagen_url: imagenUrl.trim() || null,
      p_ingredientes: ingredientesValidos.map((ing) => ({
        producto_id: ing.producto_id,
        unidad_venta_id: ing.unidad_venta_id,
        factor_cantidad: Number(ing.factor_cantidad),
      })),
    })
    setGuardando(false)

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }

    setMensaje({ tipo: 'exito', texto: editandoId ? 'Combo actualizado.' : 'Combo creado.' })
    resetForm()
    setMostrarForm(false)
    setRecarga((n) => n + 1)
  }

  // Se desactiva en vez de borrar: cuando se vendan combos (Fase 2) las
  // ventas viejas van a seguir apuntando a este registro.
  async function cambiarActivo(combo) {
    setMensaje(null)
    const { error } = await supabase
      .from('combos')
      .update({ activo: !combo.activo })
      .eq('id', combo.id)

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }
    setRecarga((n) => n + 1)
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1>Combos</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
        Un combo no tiene stock propio: es una "receta" armada con productos que ya existen. Se
        puede vender mientras haya stock de todos sus ingredientes, y al venderse descuenta el stock
        de cada uno.
      </p>

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
          {mostrarForm ? 'Cancelar' : '+ Nuevo combo'}
        </button>

        {mostrarForm && (
          <div style={{ marginTop: '1rem' }}>
            {editandoId && <p className="staff-badge staff-badge-pendiente">Editando combo existente</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem', maxWidth: 420 }}>
              <label>
                <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Nombre del combo</div>
                <input
                  type="text"
                  placeholder="Ej: Combo Asado"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  style={{ width: '100%' }}
                />
              </label>
              <label>
                <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Descripción</div>
                <textarea
                  rows={3}
                  placeholder="Ej: Ideal para 4 personas"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </label>
              <label>
                <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Precio del combo</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem' }}>
                  Precio cerrado que se cobra por el combo completo.
                </div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Ej: 25000"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                  style={{ width: 160 }}
                />
              </label>
              <label>
                <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Imagen (opcional)</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem' }}>
                  Pegá el link de una imagen (ej: /images/combos.jpg o una dirección https://...).
                </div>
                <input
                  type="text"
                  placeholder="https://..."
                  value={imagenUrl}
                  onChange={(e) => setImagenUrl(e.target.value)}
                  style={{ width: '100%' }}
                />
              </label>
              {imagenUrl.trim() && (
                <img
                  src={imagenUrl.trim()}
                  alt="Vista previa del combo"
                  style={{ width: 200, aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border)' }}
                />
              )}
            </div>

            <h2>Ingredientes</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Elegí cada producto, en qué unidad lo medís y cuánto lleva el combo (ej: 1.5 de
              "Kilo" de Carne picada).
            </p>
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Unidad</th>
                  <th>Cantidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ingredientes.map((ing, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        value={ing.producto_id}
                        onChange={(e) => actualizarIngrediente(i, 'producto_id', e.target.value)}
                      >
                        <option value="">Seleccionar producto...</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={ing.unidad_venta_id}
                        onChange={(e) => actualizarIngrediente(i, 'unidad_venta_id', e.target.value)}
                        disabled={!ing.producto_id}
                      >
                        <option value="">Unidad...</option>
                        {unidadesDe(ing.producto_id).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nombre_unidad}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Ej: 1.5"
                        value={ing.factor_cantidad}
                        onChange={(e) => actualizarIngrediente(i, 'factor_cantidad', e.target.value)}
                        style={{ width: 90 }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="staff-btn staff-btn-secundario"
                        onClick={() => quitarIngrediente(i)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="staff-btn staff-btn-secundario"
              onClick={agregarIngrediente}
              style={{ marginTop: '0.5rem' }}
            >
              + Otro ingrediente
            </button>

            {valorSuelto > 0 && (
              <p style={{ fontSize: '0.85rem', marginTop: '0.75rem' }}>
                Comprando todo suelto (a precio normal): <strong>{formatoPrecio(valorSuelto)}</strong>
                {Number(precio) > 0 && Number(precio) < valorSuelto && (
                  <> — el combo ahorra {formatoPrecio(valorSuelto - Number(precio))}</>
                )}
                {Number(precio) >= valorSuelto && (
                  <span className="staff-mensaje-alerta" style={{ display: 'block', marginTop: '0.35rem' }}>
                    Ojo: el precio del combo no es menor que comprar todo suelto.
                  </span>
                )}
              </p>
            )}

            {mensaje && (
              <p className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'} style={{ marginTop: '0.75rem' }}>
                {mensaje.texto}
              </p>
            )}

            <button type="button" className="staff-btn" onClick={guardarCombo} disabled={guardando} style={{ marginTop: '0.75rem' }}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar combo'}
            </button>
          </div>
        )}

        {!mostrarForm && mensaje && (
          <p className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'} style={{ marginTop: '0.75rem' }}>
            {mensaje.texto}
          </p>
        )}
      </div>

      {loading && <p>Cargando combos...</p>}

      {error && (
        <div className="staff-card">
          <h2>Error al consultar Supabase</h2>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}

      {!loading && !error && (
        <div className="staff-card">
          {combos.length === 0 && <p>Todavía no hay combos cargados.</p>}
          {combos.length > 0 && (
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Combo</th>
                  <th>Precio</th>
                  <th>Ingredientes</th>
                  <th>Se pueden armar</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {combos.map((combo) => {
                  const stock = stockPorCombo[combo.id]
                  return (
                    <tr key={combo.id} style={{ opacity: combo.activo ? 1 : 0.55 }}>
                      <td>
                        <strong>{combo.nombre}</strong>
                        {combo.descripcion && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            {combo.descripcion}
                          </div>
                        )}
                      </td>
                      <td>{formatoPrecio(combo.precio_fijo)}</td>
                      <td>
                        {combo.combo_ingredientes.map((ci) => (
                          <div key={ci.id}>
                            {ci.factor_cantidad} {ci.unidades_venta_producto?.nombre_unidad ?? '—'} ·{' '}
                            {ci.productos?.nombre ?? '—'}
                          </div>
                        ))}
                      </td>
                      <td>
                        {!combo.activo && '—'}
                        {combo.activo && stock && (
                          <span className={`staff-badge ${stock.disponible ? 'staff-badge-exito' : 'staff-badge-anulada'}`}>
                            {stock.disponible ? stock.stock_virtual : 'Sin stock'}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`staff-badge ${combo.activo ? 'staff-badge-pagado' : 'staff-badge-cancelado'}`}>
                          {combo.activo ? 'Activo' : 'Desactivado'}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="staff-btn staff-btn-secundario"
                          onClick={() => editarCombo(combo)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="staff-btn staff-btn-secundario"
                          onClick={() => cambiarActivo(combo)}
                        >
                          {combo.activo ? 'Desactivar' : 'Reactivar'}
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
