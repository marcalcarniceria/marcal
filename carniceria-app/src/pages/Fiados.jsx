import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { SUCURSAL_ID } from '../config/sucursal'

export function Fiados() {
  const [metodosPago, setMetodosPago] = useState([])

  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')

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

  async function crearCliente() {
    setMensaje(null)
    if (!nuevoNombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'El nombre es obligatorio.' })
      return
    }

    const { error } = await supabase.from('clientes_fiados').insert({
      nombre: nuevoNombre.trim(),
      telefono: nuevoTelefono.trim() || null,
      sucursal_id: SUCURSAL_ID,
    })

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }

    setNuevoNombre('')
    setNuevoTelefono('')
    setMensaje({ tipo: 'exito', texto: 'Cliente creado.' })
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
    <div style={{ maxWidth: 680 }}>
      <h1>Clientes fiados</h1>

      {error && <pre>{JSON.stringify(error, null, 2)}</pre>}
      {loading && <p>Cargando...</p>}

      {!loading && !error && (
        <>
          <div className="staff-card">
            <h2>Saldo por cliente</h2>
            {clientes.length === 0 && <p>No hay clientes fiados cargados.</p>}
            {clientes.length > 0 && (
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Teléfono</th>
                    <th>Debe</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nombre}</td>
                      <td>{c.telefono}</td>
                      <td className={c.saldo > 0 ? 'staff-mensaje-error' : ''}>
                        ${c.saldo.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                placeholder="Teléfono"
                value={nuevoTelefono}
                onChange={(e) => setNuevoTelefono(e.target.value)}
              />
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
    </div>
  )
}
