import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { SUCURSAL_ID } from '../config/sucursal'
import { ConfirmModal } from '../components/ConfirmModal'

const FILAS_POR_PAGINA = 20
const FILAS_PEDIDOS_CLIENTE = 5
const ROLES = ['dueño', 'cajero', 'carnicero', 'verdulero', 'repartidor']

function formatoFecha(fechaIso) {
  if (!fechaIso) return '—'
  return new Date(fechaIso).toLocaleDateString('es-AR')
}

function formatoMoneda(numero) {
  return `$${Number(numero).toFixed(2)}`
}

// --- Modal: crear empleado ---------------------------------------------

function ModalCrearEmpleado({ onClose, onCreado }) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState('cajero')
  const [creando, setCreando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [resultado, setResultado] = useState(null) // { usuario, password_generada }

  async function crear() {
    setMensaje(null)

    if (!nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'Falta el nombre.' })
      return
    }
    if (!email.trim()) {
      setMensaje({ tipo: 'error', texto: 'Falta el email.' })
      return
    }
    if (password.trim() && password.trim().length < 8) {
      setMensaje({ tipo: 'error', texto: 'La contraseña tiene que tener al menos 8 caracteres (o dejala vacía para generar una).' })
      return
    }

    setCreando(true)
    const { data, error } = await supabase.functions.invoke('admin-gestionar-usuarios', {
      body: {
        accion: 'crear_empleado',
        nombre: nombre.trim(),
        email: email.trim(),
        rol,
        sucursal_id: SUCURSAL_ID,
        password: password.trim() || undefined,
      },
    })
    setCreando(false)

    if (error || !data?.ok) {
      setMensaje({ tipo: 'error', texto: error?.message ?? data?.error ?? 'No se pudo crear el empleado.' })
      return
    }

    setResultado(data)
    onCreado()
  }

  function copiarPassword() {
    navigator.clipboard?.writeText(resultado.password_generada).catch(() => {})
  }

  return (
    <div className="staff-drawer-overlay" onClick={() => !creando && onClose()}>
      <div className="staff-drawer" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Nuevo empleado</h2>

        {resultado ? (
          <div>
            <p className="staff-mensaje-exito">Empleado "{resultado.usuario.nombre}" creado correctamente.</p>
            {resultado.password_generada && (
              <div
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '0.75rem',
                  marginTop: '0.75rem',
                  background: '#f6dcd6',
                }}
              >
                <p style={{ margin: '0 0 0.4rem', fontWeight: 600 }}>
                  Contraseña generada (copiala ahora, no se va a volver a mostrar):
                </p>
                <code style={{ fontSize: '1rem' }}>{resultado.password_generada}</code>
                <div style={{ marginTop: '0.5rem' }}>
                  <button type="button" className="staff-btn staff-btn-secundario" onClick={copiarPassword}>
                    Copiar
                  </button>
                </div>
              </div>
            )}
            <button type="button" className="staff-btn" style={{ marginTop: '1rem' }} onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label>
              Nombre
              <br />
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: '100%' }} />
            </label>
            <label>
              Email
              <br />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%' }} />
            </label>
            <label>
              Contraseña inicial (opcional)
              <br />
              <input
                type="text"
                placeholder="Dejala vacía para generar una automática"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%' }}
              />
            </label>
            <label>
              Rol
              <br />
              <select value={rol} onChange={(e) => setRol(e.target.value)} style={{ width: '100%' }}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            {mensaje && <p className="staff-mensaje-error">{mensaje.texto}</p>}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" className="staff-btn staff-btn-secundario" onClick={onClose} disabled={creando}>
                Cancelar
              </button>
              <button type="button" className="staff-btn" onClick={crear} disabled={creando}>
                {creando ? 'Creando...' : 'Crear empleado'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Modal: editar empleado (nombre / rol) ------------------------------

function ModalEditarEmpleado({ empleado, esPropio, onClose, onGuardado }) {
  const [nombre, setNombre] = useState(empleado.nombre)
  const [rol, setRol] = useState(empleado.rol)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  async function guardar() {
    setMensaje(null)

    if (!nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'Falta el nombre.' })
      return
    }
    if (esPropio && rol !== 'dueño') {
      setMensaje({ tipo: 'error', texto: 'No podés cambiarte el rol a vos mismo (te dejaría sin acceso a esta pantalla).' })
      return
    }

    setGuardando(true)
    const { error } = await supabase.from('usuarios').update({ nombre: nombre.trim(), rol }).eq('id', empleado.id)
    setGuardando(false)

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }
    onGuardado()
  }

  return (
    <div className="staff-drawer-overlay" onClick={() => !guardando && onClose()}>
      <div className="staff-drawer" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Editar empleado</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label>
            Nombre
            <br />
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: '100%' }} />
          </label>
          <label>
            Rol
            <br />
            <select value={rol} onChange={(e) => setRol(e.target.value)} style={{ width: '100%' }} disabled={esPropio}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {esPropio && (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.3rem' }}>
                No podés cambiar tu propio rol desde acá.
              </div>
            )}
          </label>

          {mensaje && <p className="staff-mensaje-error">{mensaje.texto}</p>}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="staff-btn staff-btn-secundario" onClick={onClose} disabled={guardando}>
              Cancelar
            </button>
            <button type="button" className="staff-btn" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Modal: detalle de cliente + su historial de pedidos ----------------

function ModalDetalleCliente({ cliente, onClose }) {
  const [pedidos, setPedidos] = useState([])
  const [detallePorPedido, setDetallePorPedido] = useState({})
  const [totalPedidos, setTotalPedidos] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchPedidos() {
      setLoading(true)
      setError(null)

      const { data: pedidosData, error: errorPedidos } = await supabase.rpc('admin_pedidos_cliente', {
        p_cliente_id: cliente.id,
        p_limit: FILAS_PEDIDOS_CLIENTE,
        p_offset: pagina * FILAS_PEDIDOS_CLIENTE,
      })

      if (errorPedidos) {
        setError(errorPedidos)
        setLoading(false)
        return
      }

      setPedidos(pedidosData)
      setTotalPedidos(pedidosData[0]?.total_pedidos ?? 0)

      const ids = pedidosData.map((p) => p.id)
      if (ids.length === 0) {
        setDetallePorPedido({})
        setLoading(false)
        return
      }

      const { data: detalleData, error: errorDetalle } = await supabase
        .from('detalle_pedidos')
        .select('pedido_id, cantidad, precio_unitario, subtotal, productos(nombre), combos(nombre)')
        .in('pedido_id', ids)

      if (errorDetalle) {
        setError(errorDetalle)
        setLoading(false)
        return
      }

      const agrupado = {}
      for (const d of detalleData) {
        agrupado[d.pedido_id] = [...(agrupado[d.pedido_id] ?? []), d]
      }
      setDetallePorPedido(agrupado)
      setLoading(false)
    }

    fetchPedidos()
  }, [cliente.id, pagina])

  const haySiguiente = (pagina + 1) * FILAS_PEDIDOS_CLIENTE < totalPedidos

  return (
    <div className="staff-drawer-overlay" onClick={onClose}>
      <div className="staff-drawer" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{cliente.nombre}</h2>
        <p style={{ margin: '0.2rem 0', color: 'var(--color-text-muted)' }}>{cliente.email}</p>
        {cliente.telefono && <p style={{ margin: '0.2rem 0', color: 'var(--color-text-muted)' }}>Tel: {cliente.telefono}</p>}
        {cliente.direccion && <p style={{ margin: '0.2rem 0', color: 'var(--color-text-muted)' }}>Dirección: {cliente.direccion}</p>}
        <p style={{ margin: '0.2rem 0', color: 'var(--color-text-muted)' }}>
          Cliente desde: {formatoFecha(cliente.fecha_registro)} · {cliente.cantidad_pedidos} pedido(s) en total
        </p>

        <h3 style={{ marginTop: '1.25rem' }}>Historial de pedidos</h3>

        {loading && <p>Cargando...</p>}
        {error && <p className="staff-mensaje-error">{error.message}</p>}

        {!loading && !error && pedidos.length === 0 && <p>Este cliente todavía no hizo ningún pedido.</p>}

        {!loading && !error && pedidos.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {pedidos.map((p) => {
                const lineas = detallePorPedido[p.id] ?? []
                return (
                  <div key={p.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <strong>{formatoFecha(p.fecha_creacion)}</strong>
                      <span className="staff-badge">{p.estado}</span>
                    </div>
                    <p style={{ margin: '0.3rem 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      {p.metodo_entrega === 'retiro' ? 'Retiro en el local' : p.direccion_envio}
                      {' · '}
                      {p.metodo_pago === 'efectivo' ? 'Efectivo' : 'Mercado Pago'}
                      {p.repartidor_nombre && ` · Repartidor: ${p.repartidor_nombre}`}
                    </p>
                    {lineas.map((d, i) => (
                      <div key={i} style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        {Number(d.cantidad)} x {d.combos?.nombre ?? d.productos?.nombre} — {formatoMoneda(d.subtotal)}
                      </div>
                    ))}
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 600 }}>Total: {formatoMoneda(p.total)}</p>
                  </div>
                )
              })}
            </div>

            {totalPedidos > FILAS_PEDIDOS_CLIENTE && (
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.75rem' }}>
                <button type="button" className="staff-btn staff-btn-secundario" onClick={() => setPagina((pg) => pg - 1)} disabled={pagina === 0}>
                  ← Anterior
                </button>
                <span>Página {pagina + 1}</span>
                <button type="button" className="staff-btn staff-btn-secundario" onClick={() => setPagina((pg) => pg + 1)} disabled={!haySiguiente}>
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}

        <button type="button" className="staff-btn staff-btn-secundario" style={{ marginTop: '1.25rem' }} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  )
}

// --- Pantalla principal ---------------------------------------------

export function GestionUsuarios() {
  const { usuario } = useAuth()

  const [vista, setVista] = useState('empleados')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(0)

  const [empleados, setEmpleados] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mensaje, setMensaje] = useState(null)

  const [modalCrear, setModalCrear] = useState(false)
  const [empleadoEditando, setEmpleadoEditando] = useState(null)
  const [clienteDetalle, setClienteDetalle] = useState(null)
  const [empleadoADesactivar, setEmpleadoADesactivar] = useState(null)
  const [cambiandoActivo, setCambiandoActivo] = useState(false)

  async function fetchTodo() {
    setLoading(true)
    setError(null)

    const [empleadosRes, clientesRes] = await Promise.all([
      supabase.rpc('admin_listar_usuarios'),
      supabase.rpc('admin_listar_clientes_web'),
    ])

    if (empleadosRes.error) setError(empleadosRes.error)
    else if (clientesRes.error) setError(clientesRes.error)
    else {
      setEmpleados(empleadosRes.data)
      setClientes(clientesRes.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchTodo()
  }, [])

  useEffect(() => {
    setPagina(0)
  }, [vista, busqueda])

  const listaFiltrada = useMemo(() => {
    const buscado = busqueda.trim().toLowerCase()
    const base = vista === 'empleados' ? empleados : clientes
    if (!buscado) return base
    return base.filter(
      (f) => f.nombre?.toLowerCase().includes(buscado) || f.email?.toLowerCase().includes(buscado),
    )
  }, [vista, empleados, clientes, busqueda])

  const totalFilas = listaFiltrada.length
  const haySiguiente = (pagina + 1) * FILAS_POR_PAGINA < totalFilas
  const filasPagina = listaFiltrada.slice(pagina * FILAS_POR_PAGINA, pagina * FILAS_POR_PAGINA + FILAS_POR_PAGINA)

  async function reactivar(empleado) {
    setMensaje(null)
    const { data, error } = await supabase.functions.invoke('admin-gestionar-usuarios', {
      body: { accion: 'cambiar_activo', usuario_id: empleado.id, activo: true },
    })

    if (error || !data?.ok) {
      setMensaje({ tipo: 'error', texto: error?.message ?? data?.error ?? 'No se pudo reactivar.' })
      return
    }
    setMensaje({ tipo: 'exito', texto: `"${empleado.nombre}" reactivado.` })
    fetchTodo()
  }

  async function confirmarDesactivar() {
    if (!empleadoADesactivar) return
    setCambiandoActivo(true)
    const { data, error } = await supabase.functions.invoke('admin-gestionar-usuarios', {
      body: { accion: 'cambiar_activo', usuario_id: empleadoADesactivar.id, activo: false },
    })
    setCambiandoActivo(false)

    if (error || !data?.ok) {
      setMensaje({ tipo: 'error', texto: error?.message ?? data?.error ?? 'No se pudo desactivar.' })
      setEmpleadoADesactivar(null)
      return
    }
    setMensaje({ tipo: 'exito', texto: `"${empleadoADesactivar.nombre}" desactivado.` })
    setEmpleadoADesactivar(null)
    fetchTodo()
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1>Gestión de usuarios</h1>

      <div className="staff-card">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className={`staff-btn${vista === 'empleados' ? '' : ' staff-btn-secundario'}`}
            onClick={() => setVista('empleados')}
          >
            Empleados
          </button>
          <button
            type="button"
            className={`staff-btn${vista === 'clientes' ? '' : ' staff-btn-secundario'}`}
            onClick={() => setVista('clientes')}
          >
            Clientes
          </button>

          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ marginLeft: '0.5rem' }}
          />

          {vista === 'empleados' && (
            <button type="button" className="staff-btn" style={{ marginLeft: 'auto' }} onClick={() => setModalCrear(true)}>
              + Nuevo empleado
            </button>
          )}
        </div>

        {mensaje && (
          <p className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'}>{mensaje.texto}</p>
        )}

        {loading && <p>Cargando...</p>}
        {error && <pre>{JSON.stringify(error, null, 2)}</pre>}

        {!loading && !error && totalFilas === 0 && <p>No hay resultados.</p>}

        {!loading && !error && totalFilas > 0 && (
          <>
            <table className="staff-table">
              <thead>
                {vista === 'empleados' ? (
                  <tr>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Email</th>
                    <th>Alta</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Teléfono</th>
                    <th>Registro</th>
                    <th>Pedidos</th>
                    <th></th>
                  </tr>
                )}
              </thead>
              <tbody>
                {vista === 'empleados'
                  ? filasPagina.map((e) => (
                      <tr key={e.id} style={{ opacity: e.activo ? 1 : 0.55 }}>
                        <td>{e.nombre}</td>
                        <td>{e.rol}</td>
                        <td>{e.email}</td>
                        <td>{formatoFecha(e.fecha_alta)}</td>
                        <td>
                          <span className={`staff-badge ${e.activo ? 'staff-badge-exito' : 'staff-badge-cancelado'}`}>
                            {e.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td style={{ display: 'flex', gap: '0.4rem' }}>
                          <button type="button" className="staff-btn staff-btn-secundario" onClick={() => setEmpleadoEditando(e)}>
                            Editar
                          </button>
                          {e.activo ? (
                            <button
                              type="button"
                              className="staff-btn staff-btn-secundario"
                              onClick={() => setEmpleadoADesactivar(e)}
                              disabled={e.id === usuario?.id}
                              title={e.id === usuario?.id ? 'No podés desactivarte a vos mismo' : undefined}
                            >
                              Desactivar
                            </button>
                          ) : (
                            <button type="button" className="staff-btn staff-btn-secundario" onClick={() => reactivar(e)}>
                              Reactivar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  : filasPagina.map((c) => (
                      <tr key={c.id}>
                        <td>{c.nombre}</td>
                        <td>{c.email}</td>
                        <td>{c.telefono ?? '—'}</td>
                        <td>{formatoFecha(c.fecha_registro)}</td>
                        <td>{c.cantidad_pedidos}</td>
                        <td>
                          <button type="button" className="staff-btn staff-btn-secundario" onClick={() => setClienteDetalle(c)}>
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.75rem' }}>
              <button type="button" className="staff-btn staff-btn-secundario" onClick={() => setPagina((p) => p - 1)} disabled={pagina === 0}>
                ← Anterior
              </button>
              <span>Página {pagina + 1}</span>
              <button type="button" className="staff-btn staff-btn-secundario" onClick={() => setPagina((p) => p + 1)} disabled={!haySiguiente}>
                Siguiente →
              </button>
            </div>
          </>
        )}
      </div>

      {modalCrear && (
        <ModalCrearEmpleado
          onClose={() => {
            setModalCrear(false)
            fetchTodo()
          }}
          onCreado={fetchTodo}
        />
      )}

      {empleadoEditando && (
        <ModalEditarEmpleado
          empleado={empleadoEditando}
          esPropio={empleadoEditando.id === usuario?.id}
          onClose={() => setEmpleadoEditando(null)}
          onGuardado={() => {
            setEmpleadoEditando(null)
            fetchTodo()
          }}
        />
      )}

      {clienteDetalle && <ModalDetalleCliente cliente={clienteDetalle} onClose={() => setClienteDetalle(null)} />}

      <ConfirmModal
        abierto={Boolean(empleadoADesactivar)}
        titulo="Desactivar empleado"
        mensaje={`¿Desactivar a "${empleadoADesactivar?.nombre}"? No va a poder iniciar sesión hasta que lo reactives.`}
        textoConfirmar="Desactivar"
        procesando={cambiandoActivo}
        onConfirmar={confirmarDesactivar}
        onCancelar={() => setEmpleadoADesactivar(null)}
      />
    </div>
  )
}
