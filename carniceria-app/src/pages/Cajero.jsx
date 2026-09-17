import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const TOP_N_MAS_VENDIDOS = 18

export function Cajero() {
  const { usuario } = useAuth()

  const [catalogoVenta, setCatalogoVenta] = useState([])
  const [metodosPago, setMetodosPago] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [sucursalId, setSucursalId] = useState('')
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
      const [metodosRes, sucursalesRes] = await Promise.all([
        supabase.from('metodos_pago').select('*'),
        supabase.from('sucursales').select('*'),
      ])

      if (metodosRes.error) setCatalogoError(metodosRes.error)
      else if (sucursalesRes.error) setCatalogoError(sucursalesRes.error)
      else {
        setMetodosPago(metodosRes.data)
        setSucursales(sucursalesRes.data)
      }
      setLoadingBase(false)
    }

    fetchBase()
  }, [])

  useEffect(() => {
    if (usuario?.sucursal_id) {
      setSucursalId(usuario.sucursal_id)
    }
  }, [usuario])

  useEffect(() => {
    if (!sucursalId) {
      setCatalogoVenta([])
      return
    }

    setLoadingCatalogo(true)
    supabase
      .rpc('productos_mas_vendidos', { p_sucursal_id: sucursalId })
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
              costo_vigente: Number(item.costo_vigente),
              factor_conversion_base: Number(item.factor_conversion_base),
              stock_actual_unidad_base: Number(item.stock_actual_unidad_base),
            })),
          )
        }
        setLoadingCatalogo(false)
      })
  }, [sucursalId])

  async function fetchClientesFiados(sucursal) {
    const { data, error } = await supabase
      .from('clientes_fiados')
      .select('*')
      .eq('sucursal_id', sucursal)
    if (!error) setClientesFiados(data)
  }

  useEffect(() => {
    if (sucursalId) fetchClientesFiados(sucursalId)
    else setClientesFiados([])
  }, [sucursalId])

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
        sucursal_id: sucursalId,
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

    const cantidadFinal =
      numpadModo === 'cantidad' ? valor : valor / numpadItem.precio_venta

    const nuevoItem = {
      key: `${numpadItem.unidad_venta_id}-${Date.now()}`,
      producto_id: numpadItem.producto_id,
      producto_nombre: numpadItem.producto_nombre,
      unidad_venta_id: numpadItem.unidad_venta_id,
      unidad_nombre: numpadItem.unidad_nombre,
      cantidad: cantidadFinal,
      precio_unitario_historico: Number(numpadItem.precio_venta),
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

    if (!sucursalId) {
      setMensaje({ tipo: 'error', texto: 'Seleccioná la sucursal en la que estás vendiendo.' })
      return
    }

    setEnviando(true)

    const { data, error } = await supabase.rpc('registrar_venta', {
      p_sucursal_id: sucursalId,
      p_descuento_general: Number(descuentoGeneral) || 0,
      p_items: carrito.map((item) => ({
        producto_id: item.producto_id,
        unidad_venta_id: item.unidad_venta_id,
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

      {!usuario?.sucursal_id && (
        <div className="staff-card">
          <label>
            Sucursal:{' '}
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              <option value="">Seleccionar sucursal...</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="staff-card">
        <h2>Más vendidos</h2>
        {!sucursalId && <p>Elegí la sucursal para ver el catálogo.</p>}
        {sucursalId && loadingCatalogo && <p>Cargando catálogo...</p>}
        {sucursalId && !loadingCatalogo && masVendidos.length === 0 && (
          <p>No hay productos activos en esta sucursal.</p>
        )}
        {sucursalId && !loadingCatalogo && masVendidos.length > 0 && (
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
                <span className="cajero-producto-precio">${Number(item.precio_venta).toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {sucursalId && !loadingCatalogo && otrosProductos.length > 0 && (
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
                <span className="cajero-producto-precio">${Number(item.precio_venta).toFixed(2)}</span>
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
                {numpadItem.unidad_nombre} — ${Number(numpadItem.precio_venta).toFixed(2)}
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
            </div>

            <div className="cajero-numpad-pantalla">
              {numpadModo === 'monto' ? '$' : ''}
              {numpadValor || '0'}
            </div>

            <div className="cajero-numpad-preview">
              {numpadModo === 'cantidad'
                ? `= $${((Number(numpadValor) || 0) * numpadItem.precio_venta).toFixed(2)}`
                : `≈ ${(
                    (Number(numpadValor) || 0) / numpadItem.precio_venta
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
                  <td>{item.unidad_nombre}</td>
                  <td>{item.cantidad}</td>
                  <td>${item.precio_unitario_historico.toFixed(2)}</td>
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
