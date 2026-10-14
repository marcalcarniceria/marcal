import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { WHATSAPP_LOCAL } from '../../config/sucursal'
import { linkWhatsApp } from '../../lib/whatsapp'
import { TiendaHeader } from './TiendaHeader'

// ?pago= lo agregan las back_urls de crear-preferencia-mp (aprobado /
// pendiente / rechazado) y Checkout.jsx cuando no se pudo abrir Mercado
// Pago (error). Es SOLO feedback para el cliente: quien marca el pedido
// como cobrado es webhook-mp, nunca esta página (la URL se puede tipear
// a mano).
const AVISOS_PAGO = {
  aprobado: {
    clase: 'exito',
    titulo: '¡Pago confirmado!',
    texto: 'Ya estamos preparando tu pedido.',
  },
  pendiente: {
    clase: 'pendiente',
    titulo: 'Tu pago se está procesando.',
    texto: 'Te avisaremos apenas se acredite. No hace falta que pagues de nuevo.',
  },
  rechazado: {
    clase: 'error',
    titulo: 'El pago no se pudo completar.',
    texto: 'Tu pedido quedó registrado pero todavía no está pagado. Podés intentar de nuevo o escribirnos.',
  },
  error: {
    clase: 'error',
    titulo: 'No pudimos abrir Mercado Pago.',
    texto: 'Tu pedido quedó registrado pero todavía no está pagado. Podés intentar de nuevo o escribirnos.',
  },
}

export function Confirmacion() {
  const { pedidoId } = useParams()
  const [searchParams] = useSearchParams()
  const aviso = AVISOS_PAGO[searchParams.get('pago')]
  const pagoFallido = aviso?.clase === 'error'

  const [reintentando, setReintentando] = useState(false)
  const [errorReintento, setErrorReintento] = useState(null)

  // El pedido ya existe y sigue pendiente de pago: se pide una preferencia
  // nueva para el MISMO pedido (no hace falta el carrito, que ya se vació).
  // crear-preferencia-mp rechaza el reintento si mientras tanto se cobró.
  async function reintentarPago() {
    setErrorReintento(null)
    setReintentando(true)

    const { data, error } = await supabase.functions.invoke('crear-preferencia-mp', {
      body: { pedido_id: pedidoId },
    })

    if (error || !data?.ok || !data.init_point) {
      setReintentando(false)
      setErrorReintento(data?.error ?? 'No pudimos abrir Mercado Pago. Escribinos por WhatsApp y lo resolvemos.')
      return
    }

    window.location.href = data.init_point
  }

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
