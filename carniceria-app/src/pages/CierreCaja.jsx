import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { SUCURSAL_ID } from '../config/sucursal'
import { SeccionTabs } from '../components/SeccionTabs'
import { ConfirmModal } from '../components/ConfirmModal'

const TABS_CAJA = [
  { to: '/cajero', label: 'Vender' },
  { to: '/cierre-caja', label: 'Cierre de caja', secundaria: true },
]

const METODO_EFECTIVO = 'Efectivo'
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

function resumenDetalleVenta(detalle) {
  if (!detalle || detalle.length === 0) return '—'
  const texto = detalle
    .map((d) => `${d.combos?.nombre ?? d.productos?.nombre ?? 'Producto'} x${Number(d.cantidad)}`)
    .join(', ')
  return texto.length > 60 ? `${texto.slice(0, 60)}…` : texto
}

const SELECT_LISTADO_VENTAS =
  'id, fecha_hora, total_neto, estado, motivo_anulacion, cliente_fiado_id, pagos_venta(monto, metodos_pago(nombre))'

export function CierreCaja() {
  const { usuario } = useAuth()

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

  // ---------- Listado de ventas del día (con anulación) ----------
  // Consulta aparte de la de totales: si el listado fallara, el arqueo
  // sigue funcionando. Incluye las anuladas (para que se vea qué se
  // anuló y por qué); los totales de arriba siguen usando solo activas.
  const [ventasListado, setVentasListado] = useState([])
  const [listadoError, setListadoError] = useState(null)
  const [ventaAAnular, setVentaAAnular] = useState(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [anulando, setAnulando] = useState(false)

  // Solo el dueño anula (mismo chequeo que la RPC anular_venta), y nunca
  // en un día con la caja ya cerrada (la RPC también lo rechaza).
  const puedeAnular = usuario?.rol === 'dueño' && !cierreExistente

  // ---------- Historial de cierres (columna derecha) ----------
  const [histDesde, setHistDesde] = useState(haceDiasLocal(30))
  const [histHasta, setHistHasta] = useState(hoyLocal())
  const [histPagina, setHistPagina] = useState(0)
  const [historial, setHistorial] = useState([])
  const [histTotalFilas, setHistTotalFilas] = useState(0)
  const [histLoading, setHistLoading] = useState(true)
  const [histError, setHistError] = useState(null)

  function cambiarHistDesde(valor) {
    setHistDesde(valor)
    setHistPagina(0)
  }

  function cambiarHistHasta(valor) {
    setHistHasta(valor)
    setHistPagina(0)
  }

  async function fetchHistorial() {
    setHistLoading(true)
    setHistError(null)

    let query = supabase
      .from('historial_cierres_caja')
      .select('*', { count: 'exact' })
      .eq('sucursal_id', SUCURSAL_ID)
      .order('fecha', { ascending: false })

    if (histDesde) query = query.gte('fecha', histDesde)
    if (histHasta) query = query.lte('fecha', histHasta)

    const desdeFila = histPagina * FILAS_POR_PAGINA
    query = query.range(desdeFila, desdeFila + FILAS_POR_PAGINA - 1)

    const { data, error, count } = await query

    if (error) setHistError(error)
    else {
      setHistorial(data)
      setHistTotalFilas(count ?? 0)
    }
    setHistLoading(false)
  }

  useEffect(() => {
    fetchHistorial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histDesde, histHasta, histPagina])

  const histHaySiguiente = (histPagina + 1) * FILAS_POR_PAGINA < histTotalFilas

  // Ventas del día una por una (activas y anuladas), para el listado con
  // el botón Anular. Si el embed del detalle falla (ej. falta la FK
  // detalle_ventas -> productos en la base), se reintenta sin detalle
  // para no dejar la anulación inutilizable por una columna cosmética.
  async function fetchListado(inicio, fin) {
    setListadoError(null)

    function consulta(select) {
      return supabase
        .from('ventas')
        .select(select)
        .eq('sucursal_id', SUCURSAL_ID)
        .in('estado', ['activa', 'anulada'])
        .gte('fecha_hora', inicio.toISOString())
        .lt('fecha_hora', fin.toISOString())
        .order('fecha_hora', { ascending: false })
    }

    let res = await consulta(`${SELECT_LISTADO_VENTAS}, detalle_ventas(cantidad, productos(nombre), combos(nombre))`)
    if (res.error) res = await consulta(SELECT_LISTADO_VENTAS)

    if (res.error) setListadoError(res.error.message)
    else setVentasListado(res.data)
  }

  async function fetchDia() {
    if (!fecha) return

    setLoading(true)
    setError(null)
    setMensaje(null)

    const inicio = new Date(`${fecha}T00:00:00`)
    const fin = new Date(inicio)
    fin.setDate(fin.getDate() + 1)

    fetchListado(inicio, fin)

    const [ventasRes, gastosRes, pagosFiadosRes, pagosProveedorRes, cierreRes] = await Promise.all([
      supabase
        .from('ventas')
        .select('id, total_neto, pagos_venta(monto, metodos_pago(nombre, porcentaje_comision))')
        .eq('sucursal_id', SUCURSAL_ID)
        .eq('estado', 'activa')
        .gte('fecha_hora', inicio.toISOString())
        .lt('fecha_hora', fin.toISOString()),
      supabase
        .from('gastos')
        .select('monto, metodos_pago(nombre)')
        .eq('sucursal_id', SUCURSAL_ID)
        .gte('fecha', inicio.toISOString())
        .lt('fecha', fin.toISOString()),
      supabase
        .from('pagos_fiados')
        .select('monto, metodos_pago(nombre)')
        .eq('sucursal_id', SUCURSAL_ID)
        .gte('fecha', inicio.toISOString())
        .lt('fecha', fin.toISOString()),
      supabase
        .from('pagos_proveedor')
        .select('monto, metodos_pago(nombre)')
        .eq('sucursal_id', SUCURSAL_ID)
        .gte('fecha', inicio.toISOString())
        .lt('fecha', fin.toISOString()),
      supabase
        .from('cierres_caja')
        .select('*')
        .eq('sucursal_id', SUCURSAL_ID)
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

  useEffect(() => {
    fetchDia()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha])

  function abrirAnulacion(venta) {
    setVentaAAnular(venta)
    setMotivoAnulacion('')
  }

  function cerrarAnulacion() {
    if (anulando) return
    setVentaAAnular(null)
    setMotivoAnulacion('')
  }

  async function confirmarAnulacion() {
    const motivo = motivoAnulacion.trim()
    if (motivo.length < 3) return

    setAnulando(true)
    const { error } = await supabase.rpc('anular_venta', {
      p_venta_id: ventaAAnular.id,
      p_motivo: motivo,
    })
    setAnulando(false)
    setVentaAAnular(null)
    setMotivoAnulacion('')

    if (error) {
      setMensaje({ tipo: 'error', texto: `No se pudo anular la venta: ${error.message}` })
      return
    }

    // Recarga todo el día: los totales por método y el esperado en caja
    // se recalculan sin la venta anulada (solo suman 'activa').
    await fetchDia()
    setMensaje({ tipo: 'exito', texto: 'Venta anulada. El stock se devolvió y la caja se recalculó.' })
  }

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

    if (montoApertura === '' || montoCierreDeclarado === '') {
      setMensaje({ tipo: 'error', texto: 'Completá monto de apertura y monto de cierre declarado.' })
      return
    }

    setGuardando(true)

    const { error } = await supabase.from('cierres_caja').insert({
      sucursal_id: SUCURSAL_ID,
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
    fetchHistorial()
    setCierreExistente({
      sucursal_id: SUCURSAL_ID,
      fecha,
      monto_apertura: montoApertura,
      monto_cierre_declarado: montoCierreDeclarado,
    })
  }

  return (
    <div>
      <SeccionTabs tabs={TABS_CAJA} />
      <h1>Cierre de caja</h1>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 480px', minWidth: 340 }}>
      <div className="staff-card" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
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

      {!loading && !error && (
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
            <h2>Ventas del día</h2>
            {cierreExistente && usuario?.rol === 'dueño' && (
              <p style={{ marginTop: 0, color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                La caja de este día ya está cerrada: sus ventas no se pueden anular.
              </p>
            )}
            {listadoError && <p className="staff-mensaje-error">No se pudo cargar el listado: {listadoError}</p>}
            {!listadoError && ventasListado.length === 0 && <p>No hubo ventas este día.</p>}
            {!listadoError && ventasListado.length > 0 && (
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Detalle</th>
                    <th>Pago</th>
                    <th>Total</th>
                    <th>Estado</th>
                    {puedeAnular && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {ventasListado.map((v) => {
                    const anulada = v.estado === 'anulada'
                    const pagos = v.cliente_fiado_id
                      ? 'Fiado'
                      : (v.pagos_venta ?? []).map((p) => p.metodos_pago?.nombre ?? '—').join(' + ') || '—'
                    return (
                      <tr key={v.id} style={anulada ? { opacity: 0.6 } : undefined}>
                        <td>
                          {new Date(v.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {resumenDetalleVenta(v.detalle_ventas)}
                          {anulada && v.motivo_anulacion && (
                            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                              Motivo: {v.motivo_anulacion}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{pagos}</td>
                        <td style={anulada ? { textDecoration: 'line-through' } : undefined}>
                          ${Number(v.total_neto).toFixed(2)}
                        </td>
                        <td>
                          <span className={`staff-badge ${anulada ? 'staff-badge-anulada' : 'staff-badge-activa'}`}>
                            {anulada ? 'Anulada' : 'Activa'}
                          </span>
                        </td>
                        {puedeAnular && (
                          <td>
                            {!anulada && (
                              <button
                                type="button"
                                className="staff-btn staff-btn-peligro"
                                onClick={() => abrirAnulacion(v)}
                              >
                                Anular
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
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

        <div style={{ flex: '1 1 480px', minWidth: 340 }}>
          <h2 style={{ marginTop: 0 }}>Historial de cierres</h2>

          <div className="staff-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <label>
              Desde:{' '}
              <input type="date" value={histDesde} onChange={(e) => cambiarHistDesde(e.target.value)} />
            </label>
            <label>
              Hasta:{' '}
              <input type="date" value={histHasta} onChange={(e) => cambiarHistHasta(e.target.value)} />
            </label>
          </div>

          {histError && (
            <div className="staff-card">
              <h2>Error</h2>
              <pre>{JSON.stringify(histError, null, 2)}</pre>
            </div>
          )}

          {histLoading && <p>Cargando...</p>}

          {!histLoading && !histError && (
            <div className="staff-card">
              {historial.length === 0 && <p>No hay cierres registrados en este rango.</p>}
              {historial.length > 0 && (
                <>
                  <table className="staff-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Apertura</th>
                        <th>Cierre declarado</th>
                        <th>Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historial.map((c) => {
                        const dif = Math.round(Number(c.diferencia) * 100) / 100
                        const clase =
                          Math.abs(dif) < 0.01
                            ? 'staff-mensaje-exito'
                            : dif > 0
                              ? 'staff-mensaje-alerta'
                              : 'staff-mensaje-error'
                        return (
                          <tr key={c.id}>
                            <td>{new Date(`${c.fecha}T00:00:00`).toLocaleDateString('es-AR')}</td>
                            <td>${Number(c.monto_apertura).toFixed(2)}</td>
                            <td>${Number(c.monto_cierre_declarado).toFixed(2)}</td>
                            <td className={clase}>
                              ${dif.toFixed(2)}
                              {Math.abs(dif) < 0.01 ? ' (exacta)' : dif > 0 ? ' (sobrante)' : ' (faltante)'}
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
                      onClick={() => setHistPagina((p) => p - 1)}
                      disabled={histPagina === 0}
                    >
                      ← Anterior
                    </button>
                    <span>Página {histPagina + 1}</span>
                    <button
                      type="button"
                      className="staff-btn staff-btn-secundario"
                      onClick={() => setHistPagina((p) => p + 1)}
                      disabled={!histHaySiguiente}
                    >
                      Siguiente →
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        abierto={!!ventaAAnular}
        titulo="Anular venta"
        mensaje={
          ventaAAnular
            ? `Se anula la venta de las ${new Date(ventaAAnular.fecha_hora).toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
              })} por $${Number(ventaAAnular.total_neto).toFixed(2)}: deja de contar en la caja y en los reportes, y el stock vuelve al inventario. No se puede deshacer.`
            : ''
        }
        textoConfirmar="Anular venta"
        procesando={anulando}
        confirmarDeshabilitado={motivoAnulacion.trim().length < 3}
        onConfirmar={confirmarAnulacion}
        onCancelar={cerrarAnulacion}
      >
        <label style={{ display: 'block', margin: '0 0 1rem' }}>
          Motivo de la anulación
          <textarea
            value={motivoAnulacion}
            onChange={(e) => setMotivoAnulacion(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder="Ej: se cargó 2 kg de vacío en vez de 1 kg"
            autoFocus
            disabled={anulando}
            style={{ display: 'block', width: '100%', marginTop: '0.35rem', resize: 'vertical' }}
          />
        </label>
      </ConfirmModal>
    </div>
  )
}
