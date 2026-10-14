import { Link, useParams, useSearchParams } from 'react-router-dom'
import { WHATSAPP_LOCAL } from '../../config/sucursal'
import { linkWhatsApp } from '../../lib/whatsapp'
import { useConfirmacionPago } from './useConfirmacionPago'
import { AVISOS_PAGO } from './confirmacionTextos'
import { TiendaHeader } from './TiendaHeader'

export function Confirmacion() {
  const { pedidoId } = useParams()
  const [searchParams] = useSearchParams()
  const aviso = AVISOS_PAGO[searchParams.get('pago')]
  const pagoFallido = aviso?.clase === 'error'

  const { reintentando, errorReintento, reintentarPago } = useConfirmacionPago(pedidoId)

  const linkWhatsAppPedido = linkWhatsApp(
    WHATSAPP_LOCAL,
    `Hola, hice el pedido ${pedidoId} y el pago con Mercado Pago no se pudo completar.`,
  )

  return (
    <>
      <TiendaHeader />
      <div className="tienda-contenido tienda-confirmacion" style={{ maxWidth: 480 }}>
        <h1>{pagoFallido ? 'Pedido registrado' : '¡Pedido recibido!'}</h1>

        {aviso && (
          <div className={`tienda-pago-alerta tienda-pago-alerta-${aviso.clase}`} role={pagoFallido ? 'alert' : 'status'}>
            <strong>{aviso.titulo}</strong>
            <span>{aviso.texto}</span>

            {pagoFallido && (
              <div className="tienda-pago-alerta-acciones">
                <button type="button" className="tienda-btn" onClick={reintentarPago} disabled={reintentando}>
                  {reintentando ? 'Abriendo Mercado Pago...' : 'Intentar pagar de nuevo'}
                </button>
                <a href={linkWhatsAppPedido} target="_blank" rel="noreferrer" className="tienda-btn tienda-btn-secundario">
                  Escribir por WhatsApp
                </a>
              </div>
            )}
            {errorReintento && <span className="tienda-error">{errorReintento}</span>}
          </div>
        )}

        <p>Tu número de pedido es:</p>
        <p className="numero-pedido">{pedidoId}</p>
        <p>
          {aviso
            ? 'Te vamos a contactar para coordinar la entrega. Guardá este número por las dudas.'
            : 'Te vamos a contactar para coordinar el pago y la entrega. Guardá este número por las dudas.'}
        </p>
        <Link to="/tienda" className="tienda-btn" style={{ display: 'inline-block', marginTop: '1rem', textDecoration: 'none' }}>
          Volver a la tienda
        </Link>
      </div>
    </>
  )
}
