import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { WHATSAPP_LOCAL } from '../config/sucursal'
import { linkWhatsApp } from '../lib/whatsapp'
import { useConfirmacionPago } from '../pages/tienda/useConfirmacionPago'
import { AVISOS_PAGO } from '../pages/tienda/confirmacionTextos'
import './mobile.css'

export function ConfirmacionMobile() {
  const navigate = useNavigate()
  const { pedidoId } = useParams()
  const [searchParams] = useSearchParams()
  const aviso = AVISOS_PAGO[searchParams.get('pago')]
  const pagoFallido = aviso?.clase === 'error'

  const { reintentando, errorReintento, reintentarPago } = useConfirmacionPago(pedidoId)

  const linkWhatsAppPedido = linkWhatsApp(
    WHATSAPP_LOCAL,
    `Hola, hice el pedido ${pedidoId} y el pago con Mercado Pago no se pudo completar.`,
  )

  if (pagoFallido) {
    return (
      <div className="mob-app">
        <div className="mob-confirm-fallido">
          <div className="mob-titulo">Pedido registrado</div>
          <div className="mob-confirm-alerta">
            <strong>{aviso.titulo}</strong>
            <span>{aviso.texto}</span>
          </div>

          <p>Tu número de pedido es:</p>
          <p className="mob-confirm-numero">{pedidoId}</p>

          {errorReintento && <p className="mob-login-error">{errorReintento}</p>}

          <div className="mob-confirm-acciones">
            <button type="button" className="mob-action-btn" onClick={reintentarPago} disabled={reintentando}>
              {reintentando ? 'Abriendo Mercado Pago...' : 'Intentar pagar de nuevo'}
            </button>
            <a href={linkWhatsAppPedido} target="_blank" rel="noreferrer" className="mob-confirm-whatsapp">
              Escribir por WhatsApp
            </a>
            <button type="button" className="mob-confirm-volver" onClick={() => navigate('/tienda')}>
              Volver a la tienda
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mob-app">
      <div className="mob-confirm-ok">
        <div className="mob-confirm-check">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <div className="mob-confirm-titulo">¡Pedido confirmado!</div>
        <div className="mob-confirm-numero-chico">Pedido #{pedidoId.slice(0, 8)}</div>
        <p className="mob-confirm-mensaje">
          {aviso
            ? aviso.texto
            : 'Te vamos a contactar para coordinar el pago y la entrega. Guardá este número por las dudas.'}
          {' '}Te escribimos por WhatsApp cuando salga.
        </p>

        <div className="mob-confirm-acciones">
          <button type="button" className="mob-action-btn" onClick={() => navigate('/tienda/mis-pedidos')}>
            Ver mis pedidos
          </button>
          <button type="button" className="mob-confirm-volver-outline" onClick={() => navigate('/tienda')}>
            Volver a la tienda
          </button>
        </div>
      </div>
    </div>
  )
}
