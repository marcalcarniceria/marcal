import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { SUCURSAL_ID } from '../config/sucursal'

function hoyLocal() {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d - tz).toISOString().slice(0, 10)
}

export function Gastos() {
  const { usuario } = useAuth()

  const [metodosPago, setMetodosPago] = useState([])

  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [metodoPagoId, setMetodoPagoId] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  useEffect(() => {
    supabase
      .from('metodos_pago')
      .select('*')
      .then(({ data, error }) => {
        if (error) setError(error)
        else setMetodosPago(data)
      })
  }, [])

  async function fetchGastos() {
    setLoading(true)
    const inicio = new Date(`${hoyLocal()}T00:00:00`)
    const fin = new Date(inicio)
    fin.setDate(fin.getDate() + 1)

    const { data, error } = await supabase
      .from('gastos')
      .select('*, metodos_pago(nombre)')
      .eq('sucursal_id', SUCURSAL_ID)
      .gte('fecha', inicio.toISOString())
      .lt('fecha', fin.toISOString())
      .order('fecha', { ascending: false })

    if (error) setError(error)
    else setGastos(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchGastos()
  }, [])

  async function agregarGasto() {
    setMensaje(null)

    if (!concepto.trim() || !monto || Number(monto) <= 0 || !metodoPagoId) {
      setMensaje({ tipo: 'error', texto: 'Completá concepto, monto y método de pago.' })
      return
    }

    setGuardando(true)

    const { error } = await supabase.from('gastos').insert({
      sucursal_id: SUCURSAL_ID,
      usuario_id: usuario.id,
      concepto: concepto.trim(),
      monto: Number(monto),
      fecha: new Date().toISOString(),
      metodo_pago_id: metodoPagoId,
    })

    setGuardando(false)

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }

    setConcepto('')
    setMonto('')
    setMetodoPagoId('')
    setMensaje({ tipo: 'exito', texto: 'Gasto registrado.' })
    fetchGastos()
  }

  const totalGastosDia = gastos.reduce((acc, g) => acc + Number(g.monto), 0)

  return (
    <div style={{ maxWidth: 680 }}>
      <h1>Gastos</h1>

      <div className="staff-card">
        <h2>Nuevo gasto</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Concepto (ej: bolsas, delivery)"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Monto"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
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
          <button type="button" className="staff-btn" onClick={agregarGasto} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Agregar gasto'}
          </button>
        </div>

        {mensaje && (
          <p className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'} style={{ marginTop: '0.75rem' }}>
            {mensaje.texto}
          </p>
        )}
      </div>

      <div className="staff-card">
        <h2>Gastos de hoy</h2>
        {error && <pre>{JSON.stringify(error, null, 2)}</pre>}
        {loading && <p>Cargando...</p>}
        {!loading && gastos.length === 0 && <p>Sin gastos hoy.</p>}
        {!loading && gastos.length > 0 && (
          <table className="staff-table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Método</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id}>
                  <td>{g.concepto}</td>
                  <td>{g.metodos_pago?.nombre}</td>
                  <td>${Number(g.monto).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="staff-total" style={{ marginTop: '0.75rem' }}>
          Total gastado hoy: ${totalGastosDia.toFixed(2)}
        </p>
      </div>
    </div>
  )
}
