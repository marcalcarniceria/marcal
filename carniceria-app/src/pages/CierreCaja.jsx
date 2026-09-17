import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const METODO_EFECTIVO = 'Efectivo'

function hoyLocal() {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d - tz).toISOString().slice(0, 10)
}

export function CierreCaja() {
  const { usuario } = useAuth()

  const [sucursales, setSucursales] = useState([])
  const [sucursalId, setSucursalId] = useState('')
  const [fecha, setFecha] = useState(hoyLocal())

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [ventasDelDia, setVentasDelDia] = useState([])
  const [gastosDelDia, setGastosDelDia] = useState([])
  const [pagosFiadosDelDia, setPagosFiadosDelDia] = useState([])
  const [pagosProveedorDelDia, setPagosProveedorDelDia] = useState([])
  const [cierreExistente, setCierreExistente] = useState(null)

  const [montoApertura, setMontoApertura] = useState('')
  const [montoCierreDeclarado, setMontoCierreDeclarado] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  useEffect(() => {
    supabase
      .from('sucursales')
      .select('*')
      .then(({ data, error }) => {
        if (error) setError(error)
        else setSucursales(data)
      })
  }, [])

  useEffect(() => {
    if (usuario?.sucursal_id) setSucursalId(usuario.sucursal_id)
  }, [usuario])

  useEffect(() => {
    if (!sucursalId || !fecha) return

    async function fetchDia() {
      setLoading(true)
      setError(null)
      setMensaje(null)

      const inicio = new Date(`${fecha}T00:00:00`)
      const fin = new Date(inicio)
      fin.setDate(fin.getDate() + 1)

      const [ventasRes, gastosRes, pagosFiadosRes, pagosProveedorRes, cierreRes] = await Promise.all([
        supabase
          .from('ventas')
          .select('id, total_neto, pagos_venta(monto, metodos_pago(nombre, porcentaje_comision))')
          .eq('sucursal_id', sucursalId)
          .eq('estado', 'activa')
          .gte('fecha_hora', inicio.toISOString())
          .lt('fecha_hora', fin.toISOString()),
        supabase
          .from('gastos')
          .select('monto, metodos_pago(nombre)')
          .eq('sucursal_id', sucursalId)
          .gte('fecha', inicio.toISOString())
          .lt('fecha', fin.toISOString()),
        supabase
          .from('pagos_fiados')
          .select('monto, metodos_pago(nombre)')
          .eq('sucursal_id', sucursalId)
          .gte('fecha', inicio.toISOString())
          .lt('fecha', fin.toISOString()),
        supabase
          .from('pagos_proveedor')
          .select('monto, metodos_pago(nombre)')
          .eq('sucursal_id', sucursalId)
          .gte('fecha', inicio.toISOString())
          .lt('fecha', fin.toISOString()),
        supabase
          .from('cierres_caja')
          .select('*')
          .eq('sucursal_id', sucursalId)
          .eq('fecha', fecha)
          .maybeSingle(),
      ])

      if (ventasRes.error) {
        setError(ventasRes.error)
      } else if (gastosRes.error) {
        setError(gastosRes.error)
      } else if (pagosFiadosRes.error) {
        setError(pagosFiadosRes.error)
      } else if (pagosProveedorRes.error) {
        setError(pagosProveedorRes.error)
      } else if (cierreRes.error) {
        setError(cierreRes.error)
      } else {
        setVentasDelDia(ventasRes.data)
        setGastosDelDia(gastosRes.data)
        setPagosFiadosDelDia(pagosFiadosRes.data)
        setPagosProveedorDelDia(pagosProveedorRes.data)
        setCierreExistente(cierreRes.data)
        if (cierreRes.data) {
          setMontoApertura(cierreRes.data.monto_apertura)
          setMontoCierreDeclarado(cierreRes.data.monto_cierre_declarado)
        } else {
          setMontoApertura('')
          setMontoCierreDeclarado('')
        }
      }
      setLoading(false)
    }

    fetchDia()
  }, [sucursalId, fecha])

  const porMetodo = useMemo(() => {
    const acc = {}
    for (const venta of ventasDelDia) {
      for (const pago of venta.pagos_venta ?? []) {
        const nombre = pago.metodos_pago?.nombre ?? 'Sin método'
        const comisionPct = pago.metodos_pago?.porcentaje_comision ?? 0
        if (!acc[nombre]) acc[nombre] = { nombre, total: 0, comisionPct }
        acc[nombre].total += Number(pago.monto)
      }
    }
    return Object.values(acc)
  }, [ventasDelDia])

  const totalVentasNeto = useMemo(
    () => ventasDelDia.reduce((acc, v) => acc + Number(v.total_neto), 0),
    [ventasDelDia],
  )

  const totalEfectivo = porMetodo.find((m) => m.nombre === METODO_EFECTIVO)?.total ?? 0

  function sumaEnEfectivo(filas) {
    return filas
      .filter((f) => f.metodos_pago?.nombre === METODO_EFECTIVO)
      .reduce((acc, f) => acc + Number(f.monto), 0)
  }

  const totalGastosEfectivo = useMemo(() => sumaEnEfectivo(gastosDelDia), [gastosDelDia])
  const totalPagosFiadosEfectivo = useMemo(() => sumaEnEfectivo(pagosFiadosDelDia), [pagosFiadosDelDia])
  const totalPagosProveedorEfectivo = useMemo(() => sumaEnEfectivo(pagosProveedorDelDia), [pagosProveedorDelDia])

  const totalEsperadoCaja =
    (Number(montoApertura) || 0) +
    totalEfectivo +
    totalPagosFiadosEfectivo -
    totalGastosEfectivo -
    totalPagosProveedorEfectivo

  const diferencia =
    montoCierreDeclarado === ''
      ? null
      : Math.round((Number(montoCierreDeclarado) - totalEsperadoCaja) * 100) / 100

  async function confirmarCierre() {
    setMensaje(null)

    if (!sucursalId) {
      setMensaje({ tipo: 'error', texto: 'Seleccioná la sucursal.' })
      return
    }
    if (montoApertura === '' || montoCierreDeclarado === '') {
      setMensaje({ tipo: 'error', texto: 'Completá monto de apertura y monto de cierre declarado.' })
      return
    }

    setGuardando(true)

    const { error } = await supabase.from('cierres_caja').insert({
      sucursal_id: sucursalId,
      usuario_id: usuario.id,
      fecha,
      monto_apertura: Number(montoApertura),
      monto_cierre_declarado: Number(montoCierreDeclarado),
      fecha_cierre: new Date().toISOString(),
    })

    setGuardando(false)

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }

    setMensaje({ tipo: 'exito', texto: 'Cierre de caja registrado.' })
    setCierreExistente({
      sucursal_id: sucursalId,
      fecha,
      monto_apertura: montoApertura,
      monto_cierre_declarado: montoCierreDeclarado,
    })
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <h1>Cierre de caja</h1>

      <div className="staff-card" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {!usuario?.sucursal_id && (
          <label>
            Sucursal:{' '}
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
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
          Fecha:{' '}
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </div>

      {loading && <p>Cargando...</p>}

      {error && (
        <div className="staff-card">
          <h2>Error</h2>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}

      {!loading && !error && sucursalId && (
        <>
          {cierreExistente && (
            <p className="staff-badge staff-badge-pendiente" style={{ marginBottom: '0.75rem' }}>
              Ya hay un cierre registrado para el {fecha} — valores de referencia
            </p>
          )}

          <div className="staff-card">
            <h2>Ventas del día por método de pago</h2>
            {porMetodo.length === 0 && <p>No hubo ventas este día.</p>}
            {porMetodo.length > 0 && (
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Método</th>
                    <th>Total</th>
                    <th>Comisión %</th>
                    <th>Comisión $</th>
                    <th>Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {porMetodo.map((m) => {
                    const comisionMonto = m.total * (m.comisionPct / 100)
                    return (
                      <tr key={m.nombre}>
                        <td>{m.nombre}</td>
                        <td>${m.total.toFixed(2)}</td>
                        <td>{m.comisionPct}%</td>
                        <td>${comisionMonto.toFixed(2)}</td>
                        <td>${(m.total - comisionMonto).toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <p className="staff-total" style={{ marginTop: '0.75rem' }}>
              Total ventas del día: ${totalVentasNeto.toFixed(2)}
            </p>
          </div>

          <div className="staff-card">
            <h2>Arqueo de caja (efectivo)</h2>
            <label>
              Monto de apertura: $
              <input
                type="number"
                step="0.01"
                value={montoApertura}
                onChange={(e) => setMontoApertura(e.target.value)}
                disabled={!!cierreExistente}
                style={{ width: 120, marginLeft: '0.4rem' }}
              />
            </label>
            <div style={{ marginTop: '0.75rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              <p style={{ margin: '0.2rem 0' }}>+ Ventas en efectivo: ${totalEfectivo.toFixed(2)}</p>
              <p style={{ margin: '0.2rem 0' }}>+ Cobros a fiados (efectivo): ${totalPagosFiadosEfectivo.toFixed(2)}</p>
              <p style={{ margin: '0.2rem 0' }}>− Gastos (efectivo): ${totalGastosEfectivo.toFixed(2)}</p>
              <p style={{ margin: '0.2rem 0' }}>− Pagos a proveedores (efectivo): ${totalPagosProveedorEfectivo.toFixed(2)}</p>
            </div>
            <p className="staff-total" style={{ marginTop: '0.5rem' }}>Total esperado en caja: ${totalEsperadoCaja.toFixed(2)}</p>
            <label style={{ display: 'block', marginTop: '0.5rem' }}>
              Monto de cierre declarado (contado a mano): $
              <input
                type="number"
                step="0.01"
                value={montoCierreDeclarado}
                onChange={(e) => setMontoCierreDeclarado(e.target.value)}
                disabled={!!cierreExistente}
                style={{ width: 120, marginLeft: '0.4rem' }}
              />
            </label>
            {diferencia !== null && (
              <p className={diferencia === 0 ? 'staff-mensaje-exito' : 'staff-mensaje-error'} style={{ marginTop: '0.5rem' }}>
                Diferencia: ${diferencia.toFixed(2)}{' '}
                {diferencia === 0 ? '(caja exacta)' : diferencia > 0 ? '(sobrante)' : '(faltante)'}
              </p>
            )}
          </div>

          {mensaje && (
            <p className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'}>
              {mensaje.texto}
            </p>
          )}

          {!cierreExistente && (
            <button type="button" className="staff-btn" onClick={confirmarCierre} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Confirmar cierre de caja'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
