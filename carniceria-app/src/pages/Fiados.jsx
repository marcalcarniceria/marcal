import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { NEGOCIO_NOMBRE, SUCURSAL_ID } from '../config/sucursal'
import { linkWhatsApp, telefonoArgentinoWhatsApp } from '../lib/whatsapp'

const FILAS_POR_PAGINA = 20

function moneda(n) {
  return `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// '' o 0 = sin límite (se guarda null). Devuelve undefined si es inválido.
function parsearLimite(valor) {
  if (valor === '' || valor === null) return null
  const n = Number(valor)
  if (!Number.isFinite(n) || n < 0) return undefined
  return n === 0 ? null : n
}

function mensajeRecordatorio(cliente) {
  return `Hola ${cliente.nombre}, te escribimos de ${NEGOCIO_NOMBRE}. Te recordamos que el saldo de tu cuenta es de ${moneda(cliente.saldo)}. ¡Muchas gracias!`
}

function IconoWhatsApp() {
  return (
    <svg viewBox="0 0 32 32" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M16.02 3C9.4 3 4 8.4 4 15.02c0 2.22.6 4.3 1.63 6.1L4 29l8.06-1.6a11.9 11.9 0 0 0 3.96.68c6.62 0 12.02-5.4 12.02-12.02C28.04 8.4 22.64 3 16.02 3Zm0 21.9c-1.24 0-2.46-.24-3.6-.7l-.26-.1-4.8.95.98-4.67-.17-.27a9.8 9.8 0 0 1-1.5-5.19c0-5.45 4.44-9.9 9.9-9.9 5.45 0 9.9 4.44 9.9 9.9 0 5.45-4.45 9.9-9.9 9.9Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.24-.46-2.37-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.6-.9-2.2-.24-.58-.49-.5-.67-.5-.17 0-.37-.02-.57-.02-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.5s1.07 2.9 1.22 3.1c.15.2 2.1 3.2 5.08 4.5.71.3 1.26.49 1.7.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.4.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  )
}

export function Fiados() {
  const { usuario } = useAuth()
  // Solo el dueño puede editar clientes (policy clientes_fiados_update_dueno)
  // y definir límites de crédito.
  const esDueno = usuario?.rol === 'dueño'

  const [metodosPago, setMetodosPago] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(0)

  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [nuevoLimite, setNuevoLimite] = useState('')

  // Edición (solo dueño): copia editable del cliente.
  const [editando, setEditando] = useState(null)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState(null)

  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState('')
  const [montoPago, setMontoPago] = useState('')
  const [metodoPagoId, setMetodoPagoId] = useState('')

  const [mensaje, setMensaje] = useState(null)

  useEffect(() => {
    supabase
      .from('metodos_pago')
      .select('*')
      .then(({ data, error }) => {
        if (!error) setMetodosPago(data)
      })
  }, [])

  async function fetchClientesConSaldo() {
    setLoading(true)
    setError(null)

    const [clientesRes, ventasRes, pagosRes] = await Promise.all([
      supabase.from('clientes_fiados').select('*').eq('sucursal_id', SUCURSAL_ID),
      supabase
        .from('ventas')
        .select('cliente_fiado_id, total_neto')
        .eq('sucursal_id', SUCURSAL_ID)
        .eq('estado', 'activa')
        .not('cliente_fiado_id', 'is', null),
      supabase.from('pagos_fiados').select('cliente_fiado_id, monto').eq('sucursal_id', SUCURSAL_ID),
    ])

    if (clientesRes.error) setError(clientesRes.error)
    else if (ventasRes.error) setError(ventasRes.error)
    else if (pagosRes.error) setError(pagosRes.error)
    else {
      const deudaPorCliente = {}
      for (const v of ventasRes.data) {
        deudaPorCliente[v.cliente_fiado_id] =
          (deudaPorCliente[v.cliente_fiado_id] ?? 0) + Number(v.total_neto)
      }
      for (const p of pagosRes.data) {
        deudaPorCliente[p.cliente_fiado_id] =
          (deudaPorCliente[p.cliente_fiado_id] ?? 0) - Number(p.monto)
      }

      setClientes(
        clientesRes.data.map((c) => ({ ...c, saldo: deudaPorCliente[c.id] ?? 0 })),
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchClientesConSaldo()
  }, [])

  const clientesFiltrados = useMemo(() => {
    const buscado = busqueda.trim().toLowerCase()
    if (!buscado) return clientes
    return clientes.filter((c) => c.nombre.toLowerCase().includes(buscado))
  }, [clientes, busqueda])

  useEffect(() => {
    setPagina(0)
  }, [busqueda])

  const totalFilas = clientesFiltrados.length
  const haySiguiente = (pagina + 1) * FILAS_POR_PAGINA < totalFilas
  const clientesPagina = clientesFiltrados.slice(
    pagina * FILAS_POR_PAGINA,
    pagina * FILAS_POR_PAGINA + FILAS_POR_PAGINA,
  )

  async function crearCliente() {
    setMensaje(null)
    if (!nuevoNombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'El nombre es obligatorio.' })
      return
    }

    const limite = esDueno ? parsearLimite(nuevoLimite) : null
    if (limite === undefined) {
      setMensaje({ tipo: 'error', texto: 'El límite de crédito tiene que ser un número mayor o igual a 0.' })
      return
    }

    const { error } = await supabase.from('clientes_fiados').insert({
      nombre: nuevoNombre.trim(),
      telefono: nuevoTelefono.trim() || null,
      sucursal_id: SUCURSAL_ID,
      limite_credito: limite,
    })

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }

    setNuevoNombre('')
    setNuevoTelefono('')
    setNuevoLimite('')
    setMensaje({ tipo: 'exito', texto: 'Cliente creado.' })
    fetchClientesConSaldo()
  }

  function abrirEdicion(cliente) {
    setErrorEdicion(null)
    setEditando({
      id: cliente.id,
      nombre: cliente.nombre ?? '',
      telefono: cliente.telefono ?? '',
      limite: cliente.limite_credito != null ? String(cliente.limite_credito) : '',
    })
  }

  async function guardarEdicion() {
    setErrorEdicion(null)
    if (!editando.nombre.trim()) return setErrorEdicion('El nombre es obligatorio.')
    const limite = parsearLimite(editando.limite)
    if (limite === undefined) return setErrorEdicion('El límite tiene que ser un número mayor o igual a 0.')

    setGuardandoEdicion(true)
    const { error } = await supabase
      .from('clientes_fiados')
      .update({
        nombre: editando.nombre.trim(),
        telefono: editando.telefono.trim() || null,
        limite_credito: limite,
      })
      .eq('id', editando.id)
    setGuardandoEdicion(false)

    if (error) return setErrorEdicion(error.message)

    setEditando(null)
    setMensaje({ tipo: 'exito', texto: 'Cliente actualizado.' })
    fetchClientesConSaldo()
  }

  async function registrarPago() {
    setMensaje(null)

    if (!clienteSeleccionadoId) {
      setMensaje({ tipo: 'error', texto: 'Elegí el cliente.' })
      return
    }
    if (!montoPago || Number(montoPago) <= 0 || !metodoPagoId) {
      setMensaje({ tipo: 'error', texto: 'Completá monto y método de pago.' })
      return
    }

    const { error } = await supabase.from('pagos_fiados').insert({
      sucursal_id: SUCURSAL_ID,
      cliente_fiado_id: clienteSeleccionadoId,
      monto: Number(montoPago),
      fecha: new Date().toISOString(),
      metodo_pago_id: metodoPagoId,
    })

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }

    setMontoPago('')
    setMetodoPagoId('')
    setMensaje({ tipo: 'exito', texto: 'Pago registrado.' })
    fetchClientesConSaldo()
  }

  return (
    <div>
      <h1>Clientes fiados</h1>

      {error && <pre>{JSON.stringify(error, null, 2)}</pre>}
      {loading && <p>Cargando...</p>}

      {!loading && !error && (
        <>
          <div className="staff-card">
            <h2>Saldo por cliente</h2>
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ marginBottom: '0.75rem' }}
            />
            {clientes.length === 0 && <p>No hay clientes fiados cargados.</p>}
            {clientes.length > 0 && totalFilas === 0 && <p>Ningún cliente coincide con la búsqueda.</p>}
            {totalFilas > 0 && (
              <>
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Teléfono</th>
                      <th>Debe</th>
                      <th>Límite</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientesPagina.map((c) => {
                      const limite = Number(c.limite_credito) || 0
                      const superado = limite > 0 && c.saldo > limite + 0.009
                      const numeroWa = telefonoArgentinoWhatsApp(c.telefono)
                      return (
                        <tr key={c.id} className={superado ? 'staff-fila-alerta' : undefined}>
                          <td>{c.nombre}</td>
                          <td>{c.telefono}</td>
                          <td className={c.saldo > 0 ? 'staff-mensaje-error' : ''}>{moneda(c.saldo)}</td>
                          <td>
                            {limite > 0 ? moneda(limite) : <span style={{ color: 'var(--color-text-muted)' }}>Sin límite</span>}
                            {superado && <div className="staff-detalle-faltante">Límite superado</div>}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                              {c.saldo > 0.009 &&
                                (numeroWa ? (
                                  <a
                                    href={linkWhatsApp(numeroWa, mensajeRecordatorio(c))}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="staff-btn staff-btn-whatsapp"
                                    title={`Enviar recordatorio de saldo a ${c.nombre}`}
                                    aria-label={`Enviar recordatorio de saldo por WhatsApp a ${c.nombre}`}
                                  >
                                    <IconoWhatsApp />
                                  </a>
                                ) : (
                                  <button
                                    type="button"
                                    className="staff-btn staff-btn-whatsapp"
                                    disabled
                                    title="Falta el teléfono o no es un número argentino válido"
                                    aria-label="WhatsApp no disponible: falta el teléfono"
                                  >
                                    <IconoWhatsApp />
                                  </button>
                                ))}
                              {esDueno && (
                                <button
                                  type="button"
                                  className="staff-btn staff-btn-secundario"
                                  onClick={() => abrirEdicion(c)}
                                >
                                  Editar
                                </button>
                              )}
                            </div>
                          </td>
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

          <div className="staff-card">
            <h2>Nuevo cliente</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Nombre"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
              />
              <input
                type="text"
                placeholder="Teléfono (ej. 351 386-6592)"
                value={nuevoTelefono}
                onChange={(e) => setNuevoTelefono(e.target.value)}
              />
              {esDueno && (
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="Límite de crédito ($, opcional)"
                  value={nuevoLimite}
                  onChange={(e) => setNuevoLimite(e.target.value)}
                  style={{ width: 210 }}
                />
              )}
              <button type="button" className="staff-btn" onClick={crearCliente}>
                Guardar cliente
              </button>
            </div>
          </div>

          <div className="staff-card">
            <h2>Registrar pago de un cliente</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <select
                value={clienteSeleccionadoId}
                onChange={(e) => setClienteSeleccionadoId(e.target.value)}
              >
                <option value="">Seleccionar cliente...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} (debe ${c.saldo.toFixed(2)})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Monto"
                value={montoPago}
                onChange={(e) => setMontoPago(e.target.value)}
                style={{ width: 100 }}
              />
              <select value={metodoPagoId} onChange={(e) => setMetodoPagoId(e.target.value)}>
                <option value="">Método de pago...</option>
                {metodosPago.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <button type="button" className="staff-btn" onClick={registrarPago}>
                Registrar pago
              </button>
            </div>
          </div>

          {mensaje && (
            <p className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'}>
              {mensaje.texto}
            </p>
          )}
        </>
      )}

      {editando && (
        <div className="staff-modal-overlay" onClick={() => !guardandoEdicion && setEditando(null)}>
          <div
            className="staff-modal-grande"
            style={{ maxWidth: 440 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="editar-fiado-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="staff-modal-header">
              <h2 id="editar-fiado-titulo" style={{ margin: 0 }}>
                Editar cliente
              </h2>
            </div>
            <div className="staff-modal-cuerpo" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1rem 1.25rem' }}>
              <label className="staff-campo">
                Nombre
                <input
                  type="text"
                  value={editando.nombre}
                  onChange={(e) => setEditando((prev) => ({ ...prev, nombre: e.target.value }))}
                />
              </label>
              <label className="staff-campo">
                Teléfono
                <input
                  type="text"
                  placeholder="351 386-6592"
                  value={editando.telefono}
                  onChange={(e) => setEditando((prev) => ({ ...prev, telefono: e.target.value }))}
                />
              </label>
              <label className="staff-campo">
                Límite de crédito ($)
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="Vacío o 0 = sin límite"
                  value={editando.limite}
                  onChange={(e) => setEditando((prev) => ({ ...prev, limite: e.target.value }))}
                />
              </label>
            </div>
            <div className="staff-modal-pie">
              {errorEdicion && <p className="staff-mensaje-error" style={{ margin: 0, marginRight: 'auto' }}>{errorEdicion}</p>}
              <button
                type="button"
                className="staff-btn staff-btn-secundario"
                onClick={() => setEditando(null)}
                disabled={guardandoEdicion}
              >
                Cancelar
              </button>
              <button type="button" className="staff-btn" onClick={guardarEdicion} disabled={guardandoEdicion}>
                {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
