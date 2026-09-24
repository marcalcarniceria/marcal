import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { SUCURSAL_ID } from '../config/sucursal'

const OPCIONES_RANGO = [
  { valor: 'hoy', label: 'Hoy' },
  { valor: 'semana', label: 'Esta semana' },
  { valor: 'mes', label: 'Este mes' },
  { valor: 'personalizado', label: 'Rango personalizado' },
]

function inicioDeSemana(fecha) {
  const d = new Date(fecha)
  const dia = d.getDay() // 0 = domingo
  const diff = dia === 0 ? 6 : dia - 1 // semana arranca lunes
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function aISO(fecha) {
  return fecha.toISOString().slice(0, 10)
}

// Calcula el rango de fechas (inclusive) según la opción elegida. Se
// recalcula solo cuando cambian los inputs relevantes -- lo consumen los
// reportes de abajo vía props, ninguno vuelve a resolver "hoy"/"semana"
// por su cuenta.
function calcularRango(rango, desdePersonalizado, hastaPersonalizado) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  if (rango === 'hoy') {
    return { desde: aISO(hoy), hasta: aISO(hoy) }
  }

  if (rango === 'semana') {
    return { desde: aISO(inicioDeSemana(hoy)), hasta: aISO(hoy) }
  }

  if (rango === 'mes') {
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    return { desde: aISO(inicioMes), hasta: aISO(hoy) }
  }

  // personalizado
  return {
    desde: desdePersonalizado || aISO(hoy),
    hasta: hastaPersonalizado || aISO(hoy),
  }
}

function formatoMoneda(numero) {
  return `$${Number(numero).toFixed(2)}`
}

function ReporteGanancias({ desde, hasta }) {
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('reporte_ganancias_periodo', {
        p_sucursal_id: SUCURSAL_ID,
        p_desde: desde,
        p_hasta: hasta,
      })
      .then(({ data, error: errorRpc }) => {
        if (cancelado) return
        if (errorRpc) setError(errorRpc.message)
        else setDatos(data)
        setLoading(false)
      })

    return () => {
      cancelado = true
    }
  }, [desde, hasta])

  return (
    <div className="staff-card reportes-card reportes-card-principal">
      <h2 className="reportes-card-titulo">Ganancias por período</h2>

      {loading && <p className="reportes-placeholder">Calculando...</p>}
      {error && <p className="staff-mensaje-error">{error}</p>}

      {datos && !loading && !error && (
        <>
          <p className="reportes-numero-grande">{formatoMoneda(datos.ganancia_total)}</p>
          <p className="reportes-detalle-linea">
            Mostrador: {formatoMoneda(datos.ganancia_ventas)} · Tienda online: {formatoMoneda(datos.ganancia_pedidos)}
          </p>
          {datos.lineas_pedidos_sin_costo > 0 && (
            <p className="reportes-nota">
              {datos.lineas_pedidos_sin_costo} línea(s) de pedidos online del período no tienen costo
              histórico guardado (pedidos de antes de esta función) y quedaron afuera de este cálculo.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function BarraRanking({ titulo, filas, variante }) {
  const maxValor = Math.max(1, ...filas.map((f) => Number(f.cantidad_total)))

  return (
    <div>
      <h3 className="reportes-subtitulo">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="reportes-placeholder">Sin productos activos.</p>
      ) : (
        <div className="reportes-bar-lista">
          {filas.map((fila) => {
            const cantidad = Number(fila.cantidad_total)
            const pct = (cantidad / maxValor) * 100
            return (
              <div className="reportes-bar-fila" key={fila.producto_id}>
                <span className="reportes-bar-nombre" title={fila.producto_nombre}>
                  {fila.producto_nombre}
                </span>
                <span className="reportes-bar-track">
                  <span
                    className={`reportes-bar-fill reportes-bar-fill-${variante}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="reportes-bar-valor">{cantidad.toLocaleString('es-AR')}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ReporteCanales({ desde, hasta }) {
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('reporte_canales', {
        p_sucursal_id: SUCURSAL_ID,
        p_desde: desde,
        p_hasta: hasta,
      })
      .then(({ data, error: errorRpc }) => {
        if (cancelado) return
        if (errorRpc) setError(errorRpc.message)
        else setDatos(data)
        setLoading(false)
      })

    return () => {
      cancelado = true
    }
  }, [desde, hasta])

  const total = datos ? Number(datos.total_mostrador) + Number(datos.total_online) : 0
  const pctMostrador = total > 0 ? (Number(datos.total_mostrador) / total) * 100 : 0
  const pctOnline = total > 0 ? (Number(datos.total_online) / total) * 100 : 0

  return (
    <div className="staff-card reportes-card">
      <h2 className="reportes-card-titulo">Mostrador vs. Tienda online</h2>

      {loading && <p className="reportes-placeholder">Calculando...</p>}
      {error && <p className="staff-mensaje-error">{error}</p>}

      {datos && !loading && !error && (
        total === 0 ? (
          <p className="reportes-placeholder">Sin facturación en el período.</p>
        ) : (
          <>
            <div className="reportes-barra-canales">
              <div className="reportes-barra-mostrador" style={{ width: `${pctMostrador}%` }} />
              <div className="reportes-barra-online" style={{ width: `${pctOnline}%` }} />
            </div>
            <div className="reportes-canales-leyenda">
              <p>
                <span className="reportes-leyenda-punto reportes-leyenda-mostrador" />
                Mostrador: {formatoMoneda(datos.total_mostrador)} ({pctMostrador.toFixed(0)}%)
              </p>
              <p>
                <span className="reportes-leyenda-punto reportes-leyenda-online" />
                Tienda online: {formatoMoneda(datos.total_online)} ({pctOnline.toFixed(0)}%)
              </p>
            </div>
          </>
        )
      )}
    </div>
  )
}

// Sparkline de 2 puntos: no hay serie completa de cambios acá (el RPC
// solo trae inicio/fin del período), así que muestra la tendencia
// inicio -> fin como una línea recta, en vez de solo una flecha de
// texto. Mismo criterio de color que ya usaba la celda (rojo sube,
// verde baja, gris si no cambió).
function SparklineCosto({ subio, bajo }) {
  const color = bajo ? 'var(--color-success)' : subio ? 'var(--color-error)' : 'var(--color-text-muted)'
  const y1 = subio ? 20 : bajo ? 4 : 12
  const y2 = subio ? 4 : bajo ? 20 : 12

  return (
    <svg width="48" height="24" viewBox="0 0 48 24" className="reportes-sparkline" aria-hidden="true">
      <polyline points={`4,${y1} 44,${y2}`} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="4" cy={y1} r="2.5" fill={color} />
      <circle cx="44" cy={y2} r="2.5" fill={color} />
    </svg>
  )
}

function ReporteCostos({ desde, hasta }) {
  const [filas, setFilas] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('reporte_costos_producto', {
        p_sucursal_id: SUCURSAL_ID,
        p_desde: desde,
        p_hasta: hasta,
      })
      .then(({ data, error: errorRpc }) => {
        if (cancelado) return
        if (errorRpc) setError(errorRpc.message)
        else setFilas(data)
        setLoading(false)
      })

    return () => {
      cancelado = true
    }
  }, [desde, hasta])

  return (
    <div className="staff-card reportes-card">
      <h2 className="reportes-card-titulo">Evolución de costos por producto</h2>

      {loading && <p className="reportes-placeholder">Calculando...</p>}
      {error && <p className="staff-mensaje-error">{error}</p>}

      {filas && !loading && !error && (
        filas.length === 0 ? (
          <p className="reportes-placeholder">Sin cambios de costo en el período.</p>
        ) : (
          <table className="staff-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Tendencia</th>
                <th>De → A</th>
                <th>Cambios</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => {
                const subio = Number(fila.costo_final) > Number(fila.costo_inicial)
                const igual = Number(fila.costo_final) === Number(fila.costo_inicial)
                return (
                  <tr key={`${fila.producto_id}-${fila.unidad_nombre}`}>
                    <td>
                      {fila.producto_nombre} <span className="reportes-detalle-linea">({fila.unidad_nombre})</span>
                    </td>
                    <td>
                      <SparklineCosto subio={subio} bajo={!subio && !igual} />
                    </td>
                    <td className={igual ? '' : subio ? 'reportes-costo-subio' : 'reportes-costo-bajo'}>
                      {formatoMoneda(fila.costo_inicial)} → {formatoMoneda(fila.costo_final)}
                    </td>
                    <td>{fila.cantidad_cambios}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}

function TablaSaldos({ titulo, filas, columnaNombre }) {
  return (
    <div>
      <h3 className="reportes-subtitulo">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="reportes-placeholder">Sin saldo pendiente.</p>
      ) : (
        <table className="staff-table">
          <thead>
            <tr>
              <th>{columnaNombre}</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.proveedor_id ?? fila.cliente_id}>
                <td>{fila.proveedor_nombre ?? fila.cliente_nombre}</td>
                <td className={fila.saldo > 0 ? 'reportes-costo-subio' : ''}>
                  {formatoMoneda(fila.saldo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ReporteStockBajo() {
  const [filas, setFilas] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('reporte_stock_bajo', { p_sucursal_id: SUCURSAL_ID })
      .then(({ data, error: errorRpc }) => {
        if (cancelado) return
        if (errorRpc) setError(errorRpc.message)
        else setFilas(data)
        setLoading(false)
      })

    return () => {
      cancelado = true
    }
  }, [])

  return (
    <div className="staff-card reportes-card reportes-card-ancha">
      <h2 className="reportes-card-titulo">Stock bajo + sugerencia de compra</h2>
      <p className="reportes-nota" style={{ marginTop: 0, marginBottom: '0.85rem' }}>
        Tiempo real, no depende del rango de fechas. "Proveedor sugerido" es el último proveedor que
        vendió ese producto (no hay un dato de "proveedor habitual" guardado) -- puede no ser el que
        realmente conviene contactar si el producto se compra a más de uno.
      </p>

      {loading && <p className="reportes-placeholder">Calculando...</p>}
      {error && <p className="staff-mensaje-error">{error}</p>}

      {filas && !loading && !error && (
        filas.length === 0 ? (
          <p className="reportes-placeholder">Ningún producto está por debajo de su stock mínimo.</p>
        ) : (
          <table className="staff-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Stock actual</th>
                <th>Mínimo</th>
                <th>Faltante</th>
                <th>Proveedor sugerido</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.producto_id}>
                  <td>{fila.producto_nombre}</td>
                  <td>{Number(fila.stock_actual).toLocaleString('es-AR')}</td>
                  <td>{Number(fila.stock_minimo).toLocaleString('es-AR')}</td>
                  <td className="reportes-costo-subio">{Number(fila.faltante).toLocaleString('es-AR')}</td>
                  <td>{fila.proveedor_sugerido ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}

function ReporteArqueos({ desde, hasta }) {
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('reporte_arqueos', {
        p_sucursal_id: SUCURSAL_ID,
        p_desde: desde,
        p_hasta: hasta,
      })
      .then(({ data, error: errorRpc }) => {
        if (cancelado) return
        if (errorRpc) setError(errorRpc.message)
        else setDatos(data)
        setLoading(false)
      })

    return () => {
      cancelado = true
    }
  }, [desde, hasta])

  return (
    <div className="staff-card reportes-card">
      <h2 className="reportes-card-titulo">Historial de arqueos de caja</h2>

      {loading && <p className="reportes-placeholder">Calculando...</p>}
      {error && <p className="staff-mensaje-error">{error}</p>}

      {datos && !loading && !error && (
        datos.total_cierres === 0 ? (
          <p className="reportes-placeholder">No hay cierres de caja en el período.</p>
        ) : (
          <>
            <p className="reportes-numero-mediano">
              {datos.con_diferencia} / {datos.total_cierres}
            </p>
            <p className="reportes-detalle-linea">
              {datos.con_diferencia === 0
                ? 'Ningún cierre tuvo diferencia -- caja exacta todo el período.'
                : `${datos.con_diferencia} de ${datos.total_cierres} cierre(s) tuvieron diferencia entre lo declarado y lo esperado.`}
            </p>

            {datos.detalle_diferencias.length > 0 && (
              <table className="staff-table" style={{ marginTop: '0.75rem' }}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.detalle_diferencias.map((d) => (
                    <tr key={d.fecha}>
                      <td>{d.fecha}</td>
                      <td className={Number(d.diferencia) < 0 ? 'reportes-costo-subio' : ''}>
                        {formatoMoneda(d.diferencia)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )
      )}
    </div>
  )
}

function ReporteComisiones({ desde, hasta }) {
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('reporte_comisiones', {
        p_sucursal_id: SUCURSAL_ID,
        p_desde: desde,
        p_hasta: hasta,
      })
      .then(({ data, error: errorRpc }) => {
        if (cancelado) return
        if (errorRpc) setError(errorRpc.message)
        else setDatos(data)
        setLoading(false)
      })

    return () => {
      cancelado = true
    }
  }, [desde, hasta])

  return (
    <div className="staff-card reportes-card">
      <h2 className="reportes-card-titulo">Comisiones por método de pago</h2>

      {loading && <p className="reportes-placeholder">Calculando...</p>}
      {error && <p className="staff-mensaje-error">{error}</p>}

      {datos && !loading && !error && (
        datos.por_metodo.length === 0 ? (
          <p className="reportes-placeholder">Sin movimientos con comisión en el período.</p>
        ) : (
          <>
            <p className="reportes-numero-mediano">{formatoMoneda(datos.total_comision)}</p>
            <table className="staff-table" style={{ marginTop: '0.75rem' }}>
              <thead>
                <tr>
                  <th>Método</th>
                  <th>Movido</th>
                  <th>%</th>
                  <th>Comisión</th>
                </tr>
              </thead>
              <tbody>
                {datos.por_metodo.map((m) => (
                  <tr key={m.metodo_pago_id}>
                    <td>{m.metodo_nombre}</td>
                    <td>{formatoMoneda(m.total_movido)}</td>
                    <td>{m.porcentaje_comision}%</td>
                    <td>{formatoMoneda(m.comision_monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      )}
    </div>
  )
}

function ReporteDeudas() {
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('reporte_deudas', { p_sucursal_id: SUCURSAL_ID })
      .then(({ data, error: errorRpc }) => {
        if (cancelado) return
        if (errorRpc) setError(errorRpc.message)
        else setDatos(data)
        setLoading(false)
      })

    return () => {
      cancelado = true
    }
  }, [])

  return (
    <div className="staff-card reportes-card reportes-card-ancha">
      <h2 className="reportes-card-titulo">Deuda a proveedores y saldo de fiados</h2>
      <p className="reportes-nota" style={{ marginTop: 0, marginBottom: '0.85rem' }}>
        Saldo en tiempo real, no depende del rango de fechas de arriba.
      </p>

      {loading && <p className="reportes-placeholder">Calculando...</p>}
      {error && <p className="staff-mensaje-error">{error}</p>}

      {datos && !loading && !error && (
        <div className="reportes-ranking-columnas">
          <TablaSaldos titulo="Le debemos a proveedores" filas={datos.deuda_proveedores} columnaNombre="Proveedor" />
          <TablaSaldos titulo="Nos deben (fiados)" filas={datos.saldo_fiados} columnaNombre="Cliente" />
        </div>
      )}
    </div>
  )
}

function ReporteRanking({ desde, hasta }) {
  const [filas, setFilas] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('reporte_ranking_productos', {
        p_sucursal_id: SUCURSAL_ID,
        p_desde: desde,
        p_hasta: hasta,
      })
      .then(({ data, error: errorRpc }) => {
        if (cancelado) return
        if (errorRpc) setError(errorRpc.message)
        else setFilas(data)
        setLoading(false)
      })

    return () => {
      cancelado = true
    }
  }, [desde, hasta])

  const top10 = filas?.slice(0, 10) ?? []
  const menos10 = filas ? [...filas].reverse().slice(0, 10) : []

  return (
    <div className="staff-card reportes-card reportes-card-ancha">
      <h2 className="reportes-card-titulo">Ranking de productos</h2>

      {loading && <p className="reportes-placeholder">Calculando...</p>}
      {error && <p className="staff-mensaje-error">{error}</p>}

      {filas && !loading && !error && (
        <div className="reportes-ranking-columnas">
          <BarraRanking titulo="Más vendidos" filas={top10} variante="top" />
          <BarraRanking titulo="Menos movimiento" filas={menos10} variante="bajo" />
        </div>
      )}
    </div>
  )
}

export function ReportesPage() {
  const [rango, setRango] = useState('hoy')
  const [desdePersonalizado, setDesdePersonalizado] = useState('')
  const [hastaPersonalizado, setHastaPersonalizado] = useState('')

  const { desde, hasta } = useMemo(
    () => calcularRango(rango, desdePersonalizado, hastaPersonalizado),
    [rango, desdePersonalizado, hastaPersonalizado],
  )

  return (
    <div>
      <h1>Reportes</h1>

      <div className="staff-card reportes-rango-card">
        <div className="reportes-rango">
          {OPCIONES_RANGO.map((op) => (
            <button
              key={op.valor}
              type="button"
              className={`reportes-rango-btn${rango === op.valor ? ' activo' : ''}`}
              onClick={() => setRango(op.valor)}
            >
              {op.label}
            </button>
          ))}
        </div>

        {rango === 'personalizado' && (
          <div className="reportes-rango-personalizado">
            <label>
              Desde
              <input
                type="date"
                value={desdePersonalizado}
                onChange={(e) => setDesdePersonalizado(e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={hastaPersonalizado}
                onChange={(e) => setHastaPersonalizado(e.target.value)}
              />
            </label>
          </div>
        )}

        <p className="reportes-rango-resumen">
          Mostrando del {desde} al {hasta}
        </p>
      </div>

      <div className="reportes-grid">
        <ReporteGanancias desde={desde} hasta={hasta} />
        <ReporteCanales desde={desde} hasta={hasta} />
        <ReporteRanking desde={desde} hasta={hasta} />
        <ReporteCostos desde={desde} hasta={hasta} />
        <ReporteComisiones desde={desde} hasta={hasta} />
        <ReporteArqueos desde={desde} hasta={hasta} />
        <ReporteDeudas />
        <ReporteStockBajo />
      </div>
    </div>
  )
}
