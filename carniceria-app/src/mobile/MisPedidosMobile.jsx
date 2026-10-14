import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMisPedidos } from '../pages/tienda/useMisPedidos'
import { MobileScreenHeader } from './MobileScreenHeader'
import { fmtPrecio } from './mobileFormato'
import './mobile.css'

const BADGE_POR_ESTADO = {
  pendiente_pago: { bg: '#fbe9c8', fg: '#7a5a1e' },
  pagado: { bg: '#e5f0dc', fg: '#245c27' },
  en_preparacion: { bg: '#fbe9c8', fg: '#7a5a1e' },
  en_camino: { bg: '#dbe8f4', fg: '#1d4e7a' },
  entregado: { bg: '#ece6dd', fg: '#4a3f36' },
  cancelado: { bg: '#f4d9d4', fg: '#8a2f1f' },
}

const TEXTO_POR_ESTADO = {
  pendiente_pago: 'Pendiente de pago',
  pagado: 'Pagado',
  en_preparacion: 'En preparación',
  en_camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

const ACTIVOS = ['pendiente_pago', 'pagado', 'en_preparacion', 'en_camino']

export function MisPedidosMobile() {
  const navigate = useNavigate()
  const { cliente, loading: loadingAuth } = useAuth()

  // El modal de compu solo se abre cuando ya hay `cliente` logueado
  // (TiendaHeader.jsx). Acá es una URL directa, así que hace falta el
  // mismo chequeo a mano.
  useEffect(() => {
    if (!loadingAuth && !cliente) navigate('/tienda/login', { replace: true })
  }, [loadingAuth, cliente, navigate])

  const {
    pedidos,
    detallePorPedido,
    totalFilas,
    pagina,
    setPagina,
    loading,
    error,
    repitiendoId,
    repetirPedido,
    haySiguiente,
    FILAS_POR_PAGINA,
  } = useMisPedidos()

  if (loadingAuth || !cliente) {
    return (
      <div className="mob-app">
        <MobileScreenHeader titulo="Mis pedidos" onBack={() => navigate('/tienda')} />
        <p className="mob-placeholder">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="mob-app">
      <MobileScreenHeader titulo="Mis pedidos" onBack={() => navigate('/tienda')} />

      {loading && <p className="mob-placeholder">Cargando...</p>}
      {error && <p className="mob-placeholder">No pudimos cargar tus pedidos.</p>}
      {!loading && !error && pedidos.length === 0 && (
        <p className="mob-placeholder">Todavía no hiciste ningún pedido.</p>
      )}

      {!loading && !error && pedidos.length > 0 && (
        <div className="mob-pedidos-lista">
          {pedidos.map((p) => {
            const lineas = detallePorPedido[p.id] ?? []
            const badge = BADGE_POR_ESTADO[p.estado] ?? BADGE_POR_ESTADO.pendiente_pago
            const activo = ACTIVOS.includes(p.estado)
            const resumen = lineas
              .map((d) => `${Number(d.cantidad)} x ${d.combo_id ? d.combos?.nombre ?? 'Combo' : d.productos?.nombre}`)
              .join(' · ')

            return (
              <div key={p.id} className="mob-pedido-card">
                <div className="mob-pedido-top">
                  <div>
                    <div className="mob-pedido-id">PEDIDO #{p.id.slice(0, 8)}</div>
                    <div className="mob-pedido-fecha">
                      {new Date(p.fecha_creacion).toLocaleDateString('es-AR')}
                    </div>
                  </div>
                  <span className="mob-pedido-badge" style={{ background: badge.bg, color: badge.fg }}>
                    {TEXTO_POR_ESTADO[p.estado] ?? p.estado}
                  </span>
                </div>

                {activo && (
                  <div className="mob-pedido-track">
                    <div className="mob-pedido-track-barras">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={
                            i <= ['pendiente_pago', 'pagado', 'en_preparacion', 'en_camino'].indexOf(p.estado)
                              ? 'activo'
                              : ''
                          }
                        />
                      ))}
                    </div>
                    <div className="mob-pedido-track-texto">
                      Recibido → En preparación → En camino → Entregado
                    </div>
                  </div>
                )}

                <p className="mob-pedido-resumen">{resumen}</p>

                <div className="mob-pedido-footer">
                  <span className="mob-pedido-total">{fmtPrecio(p.total)}</span>
                  <button
                    type="button"
                    className="mob-pedido-repetir"
                    onClick={() => repetirPedido(p.id)}
                    disabled={repitiendoId === p.id}
                  >
                    {repitiendoId === p.id ? 'Agregando...' : 'Repetir pedido'}
                  </button>
                </div>
              </div>
            )
          })}

          {totalFilas > FILAS_POR_PAGINA && (
            <div className="mob-pedidos-paginacion">
              <button type="button" onClick={() => setPagina((pg) => pg - 1)} disabled={pagina === 0}>
                ← Anterior
              </button>
              <span>Página {pagina + 1}</span>
              <button type="button" onClick={() => setPagina((pg) => pg + 1)} disabled={!haySiguiente}>
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
