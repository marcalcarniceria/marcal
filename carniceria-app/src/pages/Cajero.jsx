import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { SUCURSAL_ID } from '../config/sucursal'

const TOP_N_MAS_VENDIDOS = 18

// Precio en los botones de la grilla: si la unidad tiene promo, se muestra
// esa (es la que se cobra) con el precio normal tachado chiquito al lado.
function PrecioCaja({ item }) {
  return (
    <span className="cajero-producto-precio">
      ${item.precio_cobrar.toFixed(2)}
      {item.precio_promocional != null && (
        <s className="cajero-precio-original">${item.precio_venta.toFixed(2)}</s>
      )}
    </span>
  )
}

export function Cajero() {
  const { usuario } = useAuth()

  const [catalogoVenta, setCatalogoVenta] = useState([])
  const [combos, setCombos] = useState([])
  const [metodosPago, setMetodosPago] = useState([])
  const [loadingBase, setLoadingBase] = useState(true)
  const [loadingCatalogo, setLoadingCatalogo] = useState(false)
  const [catalogoError, setCatalogoError] = useState(null)

  const [numpadItem, setNumpadItem] = useState(null)
  const [numpadModo, setNumpadModo] = useState('cantidad')
  const [numpadValor, setNumpadValor] = useState('')

  const [carrito, setCarrito] = useState([])
  const [descuentoGeneral, setDescuentoGeneral] = useState(0)

  const [pagos, setPagos] = useState([{ metodo_pago_id: '', monto: '' }])

  const [esFiado, setEsFiado] = useState(false)
  const [clientesFiados, setClientesFiados] = useState([])
  const [clienteFiadoId, setClienteFiadoId] = useState('')
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false)
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('')
  const [nuevoClienteTelefono, setNuevoClienteTelefono] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  useEffect(() => {
    async function fetchBase() {
      const { data, error } = await supabase.from('metodos_pago').select('*')

      if (error) setCatalogoError(error)
      else setMetodosPago(data)
      setLoadingBase(false)
    }

    fetchBase()
  }, [])

  useEffect(() => {
    setLoadingCatalogo(true)
    supabase
      .rpc('productos_mas_vendidos', { p_sucursal_id: SUCURSAL_ID })
      .then(({ data, error }) => {
        if (error) {
          setCatalogoError(error)
        } else {
          // Postgres devuelve numeric como string vía PostgREST — se castea acá
          // una sola vez para no repetir Number(...) en cada lugar que lo usa.
          setCatalogoVenta(
            data.map((item) => ({
              ...item,
              precio_venta: Number(item.precio_venta),
              precio_promocional:
                item.precio_promocional == null ? null : Number(item.precio_promocional),
              // Precio a cobrar: misma regla que registrar_venta
              // (coalesce(precio_promocional, precio_venta)). La promo se
              // aplica siempre, sin opción de sacarla desde la caja.
              precio_cobrar: Number(item.precio_promocional ?? item.precio_venta),
              costo_vigente: Number(item.costo_vigente),
              factor_conversion_base: Number(item.factor_conversion_base),
              stock_actual_unidad_base: Number(item.stock_actual_unidad_base),
            })),
          )
        }
        setLoadingCatalogo(false)
      })

    // Combos activos (stock virtual calculado en la base, ver
    // schema_combos.sql). Se normalizan a la misma forma que un item del
    // catálogo para reutilizar el numpad y el carrito. En el mostrador no se
    // bloquean por stock (mismo criterio que los productos sueltos): la
    // cantidad armable es solo una referencia para el cajero.
    supabase
      .rpc('obtener_combos_tienda', { p_sucursal_id: SUCURSAL_ID })
      .then(({ data, error }) => {
        if (error) {
          console.error('[caja] no se pudieron cargar los combos', error)
          return
        }
        setCombos(
          data.map((c) => ({
            es_combo: true,
            combo_id: c.id,
            producto_id: null,
            unidad_venta_id: null,
            producto_nombre: c.nombre,
            unidad_nombre: 'Combo',
            precio_venta: Number(c.precio_fijo),
            precio_promocional: null,
            precio_cobrar: Number(c.precio_fijo),
            // El costo real lo calcula registrar_venta con los ingredientes.
            costo_vigente: 0,
            stock_virtual: c.stock_virtual,
          })),
        )
      })
  }, [])

  async function fetchClientesFiados() {
    const { data, error } = await supabase
      .from('clientes_fiados')
      .select('*')
      .eq('sucursal_id', SUCURSAL_ID)
    if (!error) setClientesFiados(data)
  }

  useEffect(() => {
    fetchClientesFiados()
  }, [])

  async function crearClienteFiado() {
    if (!nuevoClienteNombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'El nombre del cliente es obligatorio.' })
      return
    }

    const { data, error } = await supabase
      .from('clientes_fiados')
      .insert({
        nombre: nuevoClienteNombre.trim(),
        telefono: nuevoClienteTelefono.trim() || null,
        sucursal_id: SUCURSAL_ID,
      })
      .select()
      .single()

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }

    setClientesFiados((prev) => [...prev, data])
    setClienteFiadoId(data.id)
    setNuevoClienteNombre('')
    setNuevoClienteTelefono('')
    setMostrarNuevoCliente(false)
    setMensaje(null)
  }

  const masVendidos = catalogoVenta.slice(0, TOP_N_MAS_VENDIDOS)
  const otrosProductos = catalogoVenta.slice(TOP_N_MAS_VENDIDOS)

  function abrirNumpad(item) {
    setNumpadItem(item)
    setNumpadModo('cantidad')
    setNumpadValor('')
    setMensaje(null)
  }

  function cerrarNumpad() {
    setNumpadItem(null)
    setNumpadValor('')
  }

  function presionarDigitoNumpad(digito) {
    setNumpadValor((prev) => {
      if (digito === '.' && prev.includes('.')) return prev
      if (prev === '0' && digito !== '.') return digito
      return prev + digito
    })
  }

  function confirmarNumpad() {
    const valor = Number(numpadValor)
    if (!numpadItem || !valor || valor <= 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresá un valor mayor a cero.' })
      return
    }

    if (numpadItem.es_combo && !Number.isInteger(valor)) {
      setMensaje({ tipo: 'error', texto: 'Los combos se venden por unidad entera.' })
      return
    }

    const cantidadFinal =
      numpadModo === 'cantidad' ? valor : valor / numpadItem.precio_cobrar

    const nuevoItem = {
      key: `${numpadItem.combo_id ?? numpadItem.unidad_venta_id}-${Date.now()}`,
      combo_id: numpadItem.combo_id ?? null,
      producto_id: numpadItem.producto_id,
      producto_nombre: numpadItem.producto_nombre,
      unidad_venta_id: numpadItem.unidad_venta_id,
      unidad_nombre: numpadItem.unidad_nombre,
      cantidad: cantidadFinal,
      precio_unitario_historico: numpadItem.precio_cobrar,
      // Solo para mostrar el tachado en el carrito; no se manda al RPC.
      precio_original: numpadItem.precio_promocional == null ? null : numpadItem.precio_venta,
      costo_unitario_historico: Number(numpadItem.costo_vigente),
      descuento_aplicado: 0,
    }

    setCarrito((prev) => [...prev, nuevoItem])
    cerrarNumpad()
  }

  function quitarItem(key) {
    setCarrito((prev) => prev.filter((item) => item.key !== key))
  }

  function actualizarDescuentoItem(key, valor) {
    setCarrito((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, descuento_aplicado: Number(valor) || 0 } : item,
      ),
    )
  }

  const totalBruto = useMemo(
    () => carrito.reduce((acc, item) => acc + item.cantidad * item.precio_unitario_historico, 0),
    [carrito],
  )

  const totalItemsNeto = useMemo(
    () =>
      carrito.reduce(
        (acc, item) =>
          acc + item.cantidad * item.precio_unitario_historico - item.descuento_aplicado,
        0,
      ),
    [carrito],
  )

  const totalNeto = totalItemsNeto - (Number(descuentoGeneral) || 0)

  const totalPagado = useMemo(
    () => pagos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0),
    [pagos],
  )

  const diferenciaPago = Math.round((totalNeto - totalPagado) * 100) / 100

  function agregarPago() {
    setPagos((prev) => [...prev, { metodo_pago_id: '', monto: '' }])
  }

  function quitarPago(index) {
    setPagos((prev) => prev.filter((_, i) => i !== index))
  }

  function actualizarPago(index, campo, valor) {
    setPagos((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [campo]: valor } : p)),
    )
  }

  async function confirmarVenta() {
    setMensaje(null)

    if (carrito.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Agregá al menos un ítem a la venta.' })
      return
    }

    if (esFiado) {
      if (!clienteFiadoId) {
        setMensaje({ tipo: 'error', texto: 'Elegí el cliente fiado.' })
        return
      }
    } else {
      if (diferenciaPago !== 0) {
        setMensaje({
          tipo: 'error',
          texto: `Los pagos no cierran con el total. Diferencia: $${diferenciaPago.toFixed(2)}`,
        })
        return
      }

      if (pagos.some((p) => !p.metodo_pago_id || !p.monto)) {
        setMensaje({ tipo: 'error', texto: 'Completá método de pago y monto en cada línea de pago.' })
        return
      }
    }

    setEnviando(true)

    const { data, error } = await supabase.rpc('registrar_venta', {
      p_sucursal_id: SUCURSAL_ID,
      p_descuento_general: Number(descuentoGeneral) || 0,
      // Combos van con combo_id en vez de producto_id/unidad_venta_id; el
      // costo lo calcula registrar_venta (schema_combos_ventas.sql).
      p_items: carrito.map((item) => ({
        ...(item.combo_id
          ? { combo_id: item.combo_id }
          : { producto_id: item.producto_id, unidad_venta_id: item.unidad_venta_id }),
        cantidad: item.cantidad,
        precio_unitario_historico: item.precio_unitario_historico,
        costo_unitario_historico: item.costo_unitario_historico,
        descuento_aplicado: item.descuento_aplicado,
      })),
      p_pagos: esFiado
        ? []
        : pagos.map((p) => ({
            metodo_pago_id: p.metodo_pago_id,
            monto: Number(p.monto),
          })),
      p_cliente_fiado_id: esFiado ? clienteFiadoId : null,
    })

    setEnviando(false)

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }

    setMensaje({ tipo: 'exito', texto: `Venta registrada (id ${data}).` })
    setCarrito([])
    setDescuentoGeneral(0)
    setPagos([{ metodo_pago_id: '', monto: '' }])
    setEsFiado(false)
    setClienteFiadoId('')
  }

  if (loadingBase) return <p>Cargando...</p>

  if (catalogoError) {
    return (
      <div>
        <h2>Error al cargar el catálogo</h2>
        <pre>{JSON.stringify(catalogoError, null, 2)}</pre>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1>Caja — {usuario?.nombre}</h1>

      {combos.length > 0 && (
        <div className="staff-card">
          <h2>Combos</h2>
          <div className="cajero-grid">
            {combos.map((combo) => (
              <button
                key={combo.combo_id}
                type="button"
                className="cajero-producto-btn cajero-combo-btn"
                onClick={() => abrirNumpad(combo)}
              >
                <span className="cajero-combo-badge">Combo</span>
                <span className="cajero-producto-nombre">{combo.producto_nombre}</span>
                <span className="cajero-producto-unidad">
                  {combo.stock_virtual > 0 ? `Se pueden armar ${combo.stock_virtual}` : 'Sin stock para armar'}
                </span>
                <span className="cajero-producto-precio">${combo.precio_cobrar.toFixed(2)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="staff-card">
        <h2>Más vendidos</h2>
        {loadingCatalogo && <p>Cargando catálogo...</p>}
        {!loadingCatalogo && masVendidos.length === 0 && (
          <p>No hay productos activos.</p>
        )}
        {!loadingCatalogo && masVendidos.length > 0 && (
          <div className="cajero-grid">
            {masVendidos.map((item) => (
              <button
                key={item.unidad_venta_id}
                type="button"
                className="cajero-producto-btn"
                onClick={() => abrirNumpad(item)}
              >
                <span className="cajero-producto-nombre">{item.producto_nombre}</span>
                <span className="cajero-producto-unidad">{item.unidad_nombre}</span>
                <PrecioCaja item={item} />
              </button>
            ))}
          </div>
        )}
      </div>

      {!loadingCatalogo && otrosProductos.length > 0 && (
        <div className="staff-card">
          <h2>Otros productos</h2>
          <div className="cajero-grid cajero-grid-chica">
            {otrosProductos.map((item) => (
              <button
                key={item.unidad_venta_id}
                type="button"
                className="cajero-producto-btn cajero-producto-btn-chico"
                onClick={() => abrirNumpad(item)}
              >
                <span className="cajero-producto-nombre">{item.producto_nombre}</span>
                <span className="cajero-producto-unidad">{item.unidad_nombre}</span>
                <PrecioCaja item={item} />
              </button>
            ))}
          </div>
        </div>
      )}

      {numpadItem && (
        <div className="cajero-numpad-overlay" onClick={cerrarNumpad}>
          <div className="cajero-numpad" onClick={(e) => e.stopPropagation()}>
            <div className="cajero-numpad-header">
              <strong>{numpadItem.producto_nombre}</strong>
              <span>
                {numpadItem.unidad_nombre} — ${numpadItem.precio_cobrar.toFixed(2)}
                {numpadItem.precio_promocional != null && (
                  <s className="cajero-precio-original">${numpadItem.precio_venta.toFixed(2)}</s>
                )}
              </span>
            </div>

            <div className="cajero-numpad-modos">
              <button
                type="button"
                className={`cajero-numpad-modo${numpadModo === 'cantidad' ? ' activo' : ''}`}
                onClick={() => {
                  setNumpadModo('cantidad')
                  setNumpadValor('')
                }}
              >
                Cantidad
              </button>
              {/* Un combo no se vende "por monto": siempre unidades enteras. */}
              {!numpadItem.es_combo && (
                <button
                  type="button"
                  className={`cajero-numpad-modo${numpadModo === 'monto' ? ' activo' : ''}`}
                  onClick={() => {
                    setNumpadModo('monto')
                    setNumpadValor('')
                  }}
                >
                  Monto $
                </button>
              )}
            </div>

            <div className="cajero-numpad-pantalla">
              {numpadModo === 'monto' ? '$' : ''}
              {numpadValor || '0'}
            </div>

            <div className="cajero-numpad-preview">
              {numpadModo === 'cantidad'
                ? `= $${((Number(numpadValor) || 0) * numpadItem.precio_cobrar).toFixed(2)}`
                : `≈ ${(
                    (Number(numpadValor) || 0) / numpadItem.precio_cobrar
                  ).toFixed(3)} ${numpadItem.unidad_nombre}`}
            </div>

            <div className="cajero-numpad-teclas">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((tecla) => (
                <button
                  key={tecla}
                  type="button"
                  className="cajero-numpad-tecla"
                  onClick={() => {
                    if (tecla === '⌫') setNumpadValor((prev) => prev.slice(0, -1))
                    else presionarDigitoNumpad(tecla)
                  }}
                >
                  {tecla}
                </button>
              ))}
            </div>

            <div className="cajero-numpad-acciones">
              <button type="button" className="staff-btn staff-btn-secundario" onClick={cerrarNumpad}>
                Cancelar
              </button>
              <button type="button" className="staff-btn" onClick={confirmarNumpad}>
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="staff-card">
        <h2>Carrito</h2>
        {carrito.length === 0 && <p>Sin ítems todavía.</p>}
        {carrito.length > 0 && (
          <table className="staff-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Unidad</th>
                <th>Cant.</th>
                <th>Precio</th>
                <th>Desc.</th>
                <th>Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {carrito.map((item) => (
                <tr key={item.key}>
                  <td>{item.producto_nombre}</td>
                  <td>
                    {item.combo_id ? <span className="cajero-combo-badge">Combo</span> : item.unidad_nombre}
                  </td>
                  <td>{item.cantidad}</td>
                  <td>
                    ${item.precio_unitario_historico.toFixed(2)}
                    {item.precio_original != null && (
                      <s className="cajero-precio-original">${item.precio_original.toFixed(2)}</s>
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.descuento_aplicado}
                      onChange={(e) => actualizarDescuentoItem(item.key, e.target.value)}
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>
                    ${(
                      item.cantidad * item.precio_unitario_historico - item.descuento_aplicado
                    ).toFixed(2)}
                  </td>
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
      </div>

      <div className="staff-card">
        <h2>Totales</h2>
        <p>Total bruto: ${totalBruto.toFixed(2)}</p>
        <label>
          Descuento general: $
          <input
            type="number"
            min="0"
            step="0.01"
            value={descuentoGeneral}
            onChange={(e) => setDescuentoGeneral(e.target.value)}
            style={{ width: 100, marginLeft: '0.4rem' }}
          />
        </label>
        <p className="staff-total">Total neto: ${totalNeto.toFixed(2)}</p>
      </div>

      <div className="staff-card">
        <label>
          <input
            type="checkbox"
            checked={esFiado}
            onChange={(e) => setEsFiado(e.target.checked)}
          />{' '}
          Venta fiada (a cuenta de un cliente, sin pago ahora)
        </label>
      </div>

      {esFiado ? (
        <div className="staff-card">
          <h2>Cliente fiado</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <select value={clienteFiadoId} onChange={(e) => setClienteFiadoId(e.target.value)}>
              <option value="">Seleccionar cliente...</option>
              {clientesFiados.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="staff-btn staff-btn-secundario"
              onClick={() => setMostrarNuevoCliente((v) => !v)}
            >
              + Nuevo cliente
            </button>
          </div>

          {mostrarNuevoCliente && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              <input
                type="text"
                placeholder="Nombre"
                value={nuevoClienteNombre}
                onChange={(e) => setNuevoClienteNombre(e.target.value)}
              />
              <input
                type="text"
                placeholder="Teléfono"
                value={nuevoClienteTelefono}
                onChange={(e) => setNuevoClienteTelefono(e.target.value)}
              />
              <button type="button" className="staff-btn" onClick={crearClienteFiado}>
                Guardar cliente
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="staff-card">
          <h2>Pago (puede ser mixto)</h2>
          {pagos.map((pago, index) => (
            <div
              key={index}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}
            >
              <select
                value={pago.metodo_pago_id}
                onChange={(e) => actualizarPago(index, 'metodo_pago_id', e.target.value)}
              >
                <option value="">Método de pago...</option>
                {metodosPago.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Monto"
                value={pago.monto}
                onChange={(e) => actualizarPago(index, 'monto', e.target.value)}
                style={{ width: 100 }}
              />
              {pagos.length > 1 && (
                <button
                  type="button"
                  className="staff-btn staff-btn-secundario"
                  onClick={() => quitarPago(index)}
                >
                  Quitar
                </button>
              )}
            </div>
          ))}
          <button type="button" className="staff-btn staff-btn-secundario" onClick={agregarPago}>
            + Agregar otro método de pago
          </button>

          <p style={{ marginTop: '0.75rem' }}>
            Pagado: ${totalPagado.toFixed(2)} — Diferencia: ${diferenciaPago.toFixed(2)}
          </p>
        </div>
      )}

      {mensaje && (
        <p className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'}>
          {mensaje.texto}
        </p>
      )}

      <button type="button" className="staff-btn" onClick={confirmarVenta} disabled={enviando}>
        {enviando ? 'Registrando...' : 'Confirmar venta'}
      </button>
    </div>
  )
}
