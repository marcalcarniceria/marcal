// Edge Function: webhook-mp
//
// Recibe las notificaciones de Mercado Pago (Webhooks) y:
//   - approved                 -> marca el pedido online como COBRADO
//   - refunded / charged_back  -> ANULA ese cobro (fecha_pago = null)
//
// Anular el cobro saca el ingreso de movimientos_dinero y de
// reporte_canales (los dos definen "cobrado" solo por fecha_pago), y el
// pedido vuelve a mostrar "Marcar cobrado" en PedidosOnline.jsx -- señal
// visible para el dueño de que hay que revisarlo. No se toca `estado`:
// el pedido puede haberse entregado igual, y cancelarlo o no lo decide
// el dueño. mercadopago_payment_id se conserva como rastro.
//
// "Cobrado" en este sistema es fecha_pago no null -- lo mismo que hace
// marcar_pedido_cobrado desde el botón "Marcar cobrado" de
// PedidosOnline.jsx, y lo que lee movimientos_dinero. NO se toca
// `estado`: desde schema_metodo_pago_entrega_cobro.sql el estado refleja
// solo la etapa física (preparación/entrega) y 'pagado' ya no es un
// estado al que se transicione.
//
// El body de la notificación NO es confiable (cualquiera puede hacerle
// POST a esta URL): de la notificación solo se toma el ID del pago, y
// todo lo demás (status, monto, external_reference) se lee consultando
// el pago a la API de Mercado Pago con nuestro access token. Si además
// está configurado MP_WEBHOOK_SECRET, se valida la firma x-signature.
//
// Formatos que manda Mercado Pago:
//   Webhooks: POST ?data.id=123&type=payment
//             body { "type": "payment", "action": "payment.updated", "data": { "id": "123" } }
//   IPN (viejo): POST ?topic=payment&id=123
// Cualquier otro tipo (merchant_order, etc.) se responde 200 y se ignora.
//
// Status de respuesta: 200 = recibido (MP no reintenta); 401 = firma
// inválida; 500 = error temporal (MP reintenta la notificación más tarde,
// así que un fallo de red o de base no hace perder el pago).
//
// Secrets que necesita:
//   MP_ACCESS_TOKEN    -- el mismo que usa crear-preferencia-mp
//   MP_WEBHOOK_SECRET  -- opcional pero recomendado: "Clave secreta" de
//                         Tus integraciones > Webhooks en el panel de MP
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { MercadoPagoConfig, Payment } from 'npm:mercadopago@2'

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function hmacSha256Hex(secret: string, mensaje: string) {
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(mensaje))
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function igualesTiempoConstante(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Validación de x-signature según la doc de Mercado Pago:
//   x-signature: "ts=1704908010,v1=<hmac hex>"
//   manifest:    "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
// (las partes que no vienen en la request se omiten del manifest).
async function firmaValida(req: Request, dataId: string, secret: string) {
  const xSignature = req.headers.get('x-signature') ?? ''
  const xRequestId = req.headers.get('x-request-id')

  const partes = Object.fromEntries(
    xSignature.split(',').map((p) => {
      const [k, ...v] = p.trim().split('=')
      return [k, v.join('=')]
    }),
  )
  const ts = partes.ts
  const v1 = partes.v1
  if (!ts || !v1) return false

  let manifest = ''
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`
  if (xRequestId) manifest += `request-id:${xRequestId};`
  manifest += `ts:${ts};`

  return igualesTiempoConstante(await hmacSha256Hex(secret, manifest), v1)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return respuesta(405, { ok: false, error: 'Método no permitido.' })
  }

  try {
    const url = new URL(req.url)
    const body = await req.json().catch(() => ({}))

    const tipo = url.searchParams.get('type') ?? url.searchParams.get('topic') ?? body.type ?? body.topic
    const paymentId = String(
      url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? body.data?.id ?? '',
    ).trim()

    if (tipo !== 'payment' || !paymentId) {
      return respuesta(200, { ok: true, ignorado: true })
    }

    const webhookSecret = Deno.env.get('MP_WEBHOOK_SECRET')
    if (webhookSecret && !(await firmaValida(req, paymentId, webhookSecret))) {
      console.warn(`webhook-mp: firma inválida para el pago ${paymentId}`)
      return respuesta(401, { ok: false, error: 'Firma inválida.' })
    }

    const accessToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!accessToken) {
      console.error('webhook-mp: falta MP_ACCESS_TOKEN')
      return respuesta(500, { ok: false, error: 'Falta configurar MP_ACCESS_TOKEN.' })
    }

    // Fuente de verdad: el pago consultado a la API con NUESTRO token. Si
    // el ID no existe o no es de nuestra cuenta, el SDK tira error.
    let pago
    try {
      pago = await new Payment(new MercadoPagoConfig({ accessToken })).get({ id: paymentId })
    } catch (e) {
      console.error(`webhook-mp: no se pudo consultar el pago ${paymentId}`, e)
      return respuesta(500, { ok: false, error: 'No se pudo consultar el pago.' })
    }

    const esAnulacion = pago.status === 'refunded' || pago.status === 'charged_back'

    if (pago.status !== 'approved' && !esAnulacion) {
      // pending / in_process / rejected / cancelled: nada que hacer. Cuando
      // cambie de estado, Mercado Pago manda otra notificación.
      return respuesta(200, { ok: true, status: pago.status })
    }

    const pedidoId = pago.external_reference
    if (!pedidoId) {
      console.warn(`webhook-mp: el pago ${paymentId} no tiene external_reference`)
      return respuesta(200, { ok: true, ignorado: true })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: pedido, error: errorPedido } = await supabase
      .from('pedidos_online')
      .select('id, total, fecha_pago, mercadopago_payment_id')
      .eq('id', pedidoId)
      .maybeSingle()

    if (errorPedido) {
      console.error('webhook-mp: error leyendo el pedido', errorPedido)
      return respuesta(500, { ok: false, error: errorPedido.message })
    }
    if (!pedido) {
      console.warn(`webhook-mp: el pago ${paymentId} apunta a un pedido inexistente (${pedidoId})`)
      return respuesta(200, { ok: true, ignorado: true })
    }

    if (esAnulacion) {
      // Solo se anula si lo devuelto es EL pago que marcó el cobro: un
      // pedido cobrado en mano (mercadopago_payment_id null) o con otro
      // pago (ej. el cliente pagó dos veces y se le devolvió el duplicado)
      // no se toca.
      if (pedido.mercadopago_payment_id !== String(pago.id)) {
        console.warn(
          `webhook-mp: ${pago.status} del pago ${pago.id} no corresponde al cobro registrado del pedido ${pedidoId} (${pedido.mercadopago_payment_id ?? 'sin pago MP'})`,
        )
        return respuesta(200, { ok: true, ignorado: true })
      }

      // Idempotencia: si ya está anulado, no hay nada que hacer.
      if (!pedido.fecha_pago) {
        return respuesta(200, { ok: true, ya_anulado: true })
      }

      // Las mismas condiciones en el UPDATE: si en el medio el dueño lo
      // volvió a marcar a mano con otro medio, no se pisa.
      const { error: errorAnular } = await supabase
        .from('pedidos_online')
        .update({ fecha_pago: null, cobrado_por: null })
        .eq('id', pedidoId)
        .eq('mercadopago_payment_id', String(pago.id))
        .not('fecha_pago', 'is', null)

      if (errorAnular) {
        console.error('webhook-mp: error anulando el cobro', errorAnular)
        return respuesta(500, { ok: false, error: errorAnular.message })
      }

      console.warn(`webhook-mp: cobro anulado del pedido ${pedidoId} por ${pago.status} (${pago.status_detail})`)
      return respuesta(200, { ok: true, pedido_id: pedidoId, anulado: true, status: pago.status })
    }

    // Idempotencia: Mercado Pago puede mandar la misma notificación varias
    // veces (payment.created + payment.updated, reintentos).
    if (pedido.fecha_pago) {
      return respuesta(200, { ok: true, ya_cobrado: true })
    }

    // El monto acreditado tiene que cubrir el total registrado del pedido.
    // Si no coincide, no se marca: queda para revisión manual (el dueño
    // sigue teniendo el botón "Marcar cobrado").
    const montoPagado = Math.round(Number(pago.transaction_amount) * 100)
    const totalPedido = Math.round(Number(pedido.total) * 100)
    if (pago.currency_id !== 'ARS' || montoPagado < totalPedido) {
      console.error(
        `webhook-mp: monto no coincide para el pedido ${pedidoId} -- pagado ${pago.transaction_amount} ${pago.currency_id}, total ${pedido.total}`,
      )
      return respuesta(200, { ok: false, error: 'El monto del pago no coincide con el pedido.' })
    }

    // `.is('fecha_pago', null)` en el mismo UPDATE: si dos notificaciones
    // llegan a la vez, solo una lo marca (y no pisa un cobro manual).
    const { error: errorUpdate } = await supabase
      .from('pedidos_online')
      .update({
        fecha_pago: pago.date_approved ?? new Date().toISOString(),
        mercadopago_payment_id: String(pago.id),
      })
      .eq('id', pedidoId)
      .is('fecha_pago', null)

    if (errorUpdate) {
      console.error('webhook-mp: error actualizando el pedido', errorUpdate)
      return respuesta(500, { ok: false, error: errorUpdate.message })
    }

    return respuesta(200, { ok: true, pedido_id: pedidoId, cobrado: true })
  } catch (e) {
    console.error('webhook-mp: error inesperado', e)
    return respuesta(500, { ok: false, error: (e as Error)?.message ?? 'Error inesperado.' })
  }
})
