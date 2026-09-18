import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { SUCURSAL_ID } from '../config/sucursal'

const FILAS_POR_PAGINA = 20

function hoyLocal() {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d - tz).toISOString().slice(0, 10)
}

function haceDiasLocal(dias) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d - tz).toISOString().slice(0, 10)
}

// Las fechas del filtro son "yyyy-mm-dd" (date input) -- se convierten acá
// a límites de timestamp: desde a las 00:00 y hasta al día SIGUIENTE a las
// 00:00 (exclusivo), para incluir todo el día "hasta" completo.
function rangoFechas(desde, hasta) {
  const desdeISO = desde ? `${desde}T00:00:00` : null
  let hastaISO = null
  if (hasta) {
    const finExclusivo = new Date(`${hasta}T00:00:00`)
    finExclusivo.setDate(finExclusivo.getDate() + 1)
    hastaISO = finExclusivo.toISOString()
  }
  return { desdeISO, hastaISO }
}

export function MovimientosDinero() {
  const [desde, setDesde] = useState(haceDiasLocal(30))
  const [hasta, setHasta] = useState(hoyLocal())
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [pagina, setPagina] = useState(0)

  const [movimientos, setMovimientos] = useState([])
  const [totalFilas, setTotalFilas] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [totales, setTotales] = useState({ ingresos: 0, egresos: 0 })

  function cambiarDesde(valor) {
    setDesde(valor)
    setPagina(0)
  }

  function cambiarHasta(valor) {
    setHasta(valor)
    setPagina(0)
  }

  function cambiarTipoFiltro(valor) {
    setTipoFiltro(valor)
    setPagina(0)
  }

  async function fetchMovimientos() {
    setLoading(true)
    setError(null)

    const { desdeISO, hastaISO } = rangoFechas(desde, hasta)

    let query = supabase
      .from('movimientos_dinero')
      .select('*', { count: 'exact' })
      .eq('sucursal_id', SUCURSAL_ID)
      .order('fecha', { ascending: false })

    if (desdeISO) query = query.gte('fecha', desdeISO)
    if (hastaISO) query = query.lt('fecha', hastaISO)
    if (tipoFiltro !== 'todos') query = query.eq('tipo', tipoFiltro)

    const desdeFila = pagina * FILAS_POR_PAGINA
    query = query.range(desdeFila, desdeFila + FILAS_POR_PAGINA - 1)

    const { data, error, count } = await query

    if (error) setError(error)
    else {
      setMovimientos(data)
      setTotalFilas(count ?? 0)
    }
    setLoading(false)
  }

  // Los totales de arriba son independientes de la página y del filtro de
  // tipo (siempre ingresos vs. egresos de TODO el rango de fechas) -- se
  // calculan con SUM() en el servidor vía RPC, no sumando lo que trae la
  // query paginada (que solo trae una página de filas).
  async function fetchTotales() {
    const { desdeISO, hastaISO } = rangoFechas(desde, hasta)

    const { data, error } = await supabase.rpc('movimientos_dinero_totales', {
      p_sucursal_id: SUCURSAL_ID,
      p_desde: desdeISO,
      p_hasta: hastaISO,
    })

    if (!error && data?.[0]) {
      setTotales({
        ingresos: Number(data[0].total_ingresos),
        egresos: Number(data[0].total_egresos),
      })
    }
  }

  useEffect(() => {
    fetchMovimientos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, tipoFiltro, pagina])

  useEffect(() => {
    fetchTotales()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta])

  const saldoNeto = totales.ingresos - totales.egresos
  const haySiguiente = (pagina + 1) * FILAS_POR_PAGINA < totalFilas

  return (
    <div style={{ maxWidth: 900 }}>
      <h1>Movimientos de dinero</h1>

      <div className="movimientos-resumen">
        <div className="staff-card movimientos-resumen-card">
          <h2>Total ingresos</h2>
          <p className="movimientos-resumen-monto movimientos-ingreso">${totales.ingresos.toFixed(2)}</p>
        </div>
        <div className="staff-card movimientos-resumen-card">
          <h2>Total egresos</h2>
          <p className="movimientos-resumen-monto movimientos-egreso">${totales.egresos.toFixed(2)}</p>
        </div>
        <div className="staff-card movimientos-resumen-card">
          <h2>Saldo neto</h2>
          <p className={`movimientos-resumen-monto ${saldoNeto >= 0 ? 'movimientos-ingreso' : 'movimientos-egreso'}`}>
            ${saldoNeto.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="staff-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
        <label>
          Desde:{' '}
          <input type="date" value={desde} onChange={(e) => cambiarDesde(e.target.value)} />
        </label>
        <label>
          Hasta:{' '}
          <input type="date" value={hasta} onChange={(e) => cambiarHasta(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={`staff-btn${tipoFiltro === 'todos' ? '' : ' staff-btn-secundario'}`}
            onClick={() => cambiarTipoFiltro('todos')}
          >
            Todos
          </button>
          <button
            type="button"
            className={`staff-btn${tipoFiltro === 'ingreso' ? '' : ' staff-btn-secundario'}`}
            onClick={() => cambiarTipoFiltro('ingreso')}
          >
            Ingresos
          </button>
          <button
            type="button"
            className={`staff-btn${tipoFiltro === 'egreso' ? '' : ' staff-btn-secundario'}`}
            onClick={() => cambiarTipoFiltro('egreso')}
          >
            Egresos
          </button>
        </div>
      </div>

      {error && (
        <div className="staff-card">
          <h2>Error al consultar Supabase</h2>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}

      {loading && <p>Cargando...</p>}

      {!loading && !error && (
        <div className="staff-card">
          {movimientos.length === 0 && <p>No hay movimientos en este rango.</p>}
          {movimientos.length > 0 && (
            <>
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Motivo</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={`${m.tipo}-${m.id}`}>
                      <td>{new Date(m.fecha).toLocaleDateString('es-AR')}</td>
                      <td className={m.tipo === 'ingreso' ? 'movimientos-ingreso' : 'movimientos-egreso'}>
                        {m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
                      </td>
                      <td>{m.motivo}</td>
                      <td className={m.tipo === 'ingreso' ? 'movimientos-ingreso' : 'movimientos-egreso'}>
                        ${Number(m.monto).toFixed(2)}
                      </td>
                    </tr>
                  ))}
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
      )}
    </div>
  )
}
