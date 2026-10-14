// Edge Function: crear-preferencia-mp
//
// Genera una preferencia de Mercado Pago Checkout Pro para un pedido
// online YA registrado (por crear_pedido_online) y devuelve el
// init_point al que el frontend redirige al cliente.
//
// El MP_ACCESS_TOKEN vive ACÁ (secret de la función), nunca en el
// frontend -- se lee siempre de Deno.env.
//
// Body esperado:
//   { "pedido_id": "uuid", "items": [...] }
//   -- `items` (el carrito) es opcional y se IGNORA para los montos: los
//   ítems y precios se arman leyendo detalle_pedidos con la service role,
//   así un cliente no puede mandar su propio precio y pagar menos de lo
//   que quedó registrado en el pedido.
//
// Respuesta (siempre HTTP 200, mismo criterio que calcular_distancia_zona):
//   { "ok": true, "init_point": "https://www.mercadopago.com.ar/checkout/...", "preference_id": "..." }
//   { "ok": false, "error": "..." }
//
// Secrets que necesita:
//   MP_ACCESS_TOKEN  -- access token de producción (APP_USR-...)
//   SITE_URL         -- base de la tienda para las back_urls
//                       (ej. http://localhost:5173 en desarrollo)
//   MP_NOTIFICATION_URL -- opcional; por defecto apunta a webhook-mp en
//                       este mismo proyecto de Supabase
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { MercadoPagoConfig, Preference } from 'npm:mercadopago@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function redondear(n: number) {
  return Math.round(n * 100) / 100
}

// Mercado Pago exige quantity entera -- en la carnicería se vende por
// kilo (ej. 1.5 kg), así que las cantidades fraccionarias se mandan como
// una sola línea con quantity 1 y unit_price = subtotal de la línea.
function cantidadLegible(cantidad: number) {
  return Number.isInteger(cantidad) ? String(cantidad) : cantidad.toFixed(3).replace(/\.?0+$/, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const accessToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!accessToken) {
      return jsonResponse({ ok: false, error: 'Falta configurar MP_ACCESS_TOKEN en los secrets de la función.' })
    }
    const siteUrl = (Deno.env.get('SITE_URL') ?? 'http://localhost:5173').replace(/\/+$/, '')

    const body = await req.json().catch(() => ({}))
    const pedidoId = typeof body.pedido_id === 'string' ? body.pedido_id.trim() : ''
    if (!pedidoId) {
      return jsonResponse({ ok: false, error: 'Falta pedido_id.' })
    }

    // Service role: el checkout puede hacerse sin login (cliente anónimo),
    // y RLS no le deja leer pedidos_online/detalle_pedidos al rol anon.
    // La barrera real es que el pedido_id es un uuid que solo conoce quien
    // lo acaba de crear, y que solo se arma preferencia para pedidos de
    // Mercado Pago todavía pendientes de pago.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: pedido, error: errorPedido } = await supabase
      .from('pedidos_online')
      .select(
        'id, total, costo_envio, estado, metodo_pago, fecha_pago, cliente_nombre, detalle_pedidos(cantidad, subtotal, productos(nombre), unidades_venta_producto(nombre_unidad), combos(nombre))',
      )
      .eq('id', pedidoId)
      .maybeSingle()

    if (errorPedido) {
      return jsonResponse({ ok: false, error: errorPedido.message })
    }
    if (!pedido) {
      return jsonResponse({ ok: false, error: 'El pedido no existe.' })
    }
    if (pedido.metodo_pago !== 'mercadopago') {
      return jsonResponse({ ok: false, error: 'El pedido no es de Mercado Pago.' })
    }
    if (pedido.estado !== 'pendiente_pago' || pedido.fecha_pago) {
      return jsonResponse({ ok: false, error: 'El pedido ya no está pendiente de pago.' })
    }

    // deno-lint-ignore no-explicit-any
    const lineas = (pedido.detalle_pedidos ?? []).map((d: any) => {
      const cantidad = Number(d.cantidad)
      const subtotal = redondear(Number(d.subtotal))
      const nombre = d.combos?.nombre ?? d.productos?.nombre ?? 'Producto'
      const unidad = d.unidades_venta_producto?.nombre_unidad

      if (Number.isInteger(cantidad)) {
        return {
          title: unidad ? `${nombre} (${unidad})` : nombre,
          quantity: cantidad,
          unit_price: redondear(subtotal / cantidad),
        }
      }
      return {
        title: `${nombre} — ${cantidadLegible(cantidad)}${unidad ? ` ${unidad}` : ''}`,
        quantity: 1,
        unit_price: subtotal,
      }
    })

    const costoEnvio = redondear(Number(pedido.costo_envio))
    if (costoEnvio > 0) {
      lineas.push({ title: 'Envío a domicilio', quantity: 1, unit_price: costoEnvio })
    }

    // El monto que se cobra tiene que ser EXACTAMENTE pedidos_online.total.
    // Si el redondeo de unit_price (subtotal / cantidad) desfasa algún
    // centavo, se cobra el pedido como una sola línea con el total real.
    const total = redondear(Number(pedido.total))
    const sumaLineas = redondear(
      lineas.reduce((acc: number, l: { quantity: number; unit_price: number }) => acc + l.quantity * l.unit_price, 0),
    )
    const items = (sumaLineas === total && lineas.length > 0 ? lineas : [
      { title: `Pedido ${pedido.id.slice(0, 8)}`, quantity: 1, unit_price: total },
    ]).map((l: { title: string; quantity: number; unit_price: number }, i: number) => ({
      id: `${pedido.id}-${i}`,
      title: l.title.slice(0, 250),
      quantity: l.quantity,
      unit_price: l.unit_price,
      currency_id: 'ARS',
    }))

    const urlRetorno = `${siteUrl}/tienda/confirmacion/${pedido.id}`

    // El cobro lo confirma webhook-mp, nunca la back_url de success (esa
    // URL la puede abrir cualquiera a mano). source_news=webhooks evita
    // que MP mande además las notificaciones IPN viejas (duplicadas).
    // Solo se manda si es https: MP no puede notificar a una URL local
    // (supabase functions serve), así que ahí se omite.
    const notificationUrl =
      Deno.env.get('MP_NOTIFICATION_URL') ??
      `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '')}/functions/v1/webhook-mp?source_news=webhooks`

    const preference = await new Preference(new MercadoPagoConfig({ accessToken })).create({
      body: {
        items,
        external_reference: pedido.id,
        payer: { name: pedido.cliente_nombre },
        back_urls: {
          success: `${urlRetorno}?pago=aprobado`,
          failure: `${urlRetorno}?pago=rechazado`,
          pending: `${urlRetorno}?pago=pendiente`,
        },
        // Mercado Pago rechaza auto_return cuando la back_url de success no
        // es una URL pública (http://localhost) -- en desarrollo el cliente
        // vuelve con el botón "Volver al sitio" en vez de automáticamente.
        ...(siteUrl.startsWith('https://') ? { auto_return: 'approved' } : {}),
        ...(notificationUrl.startsWith('https://') ? { notification_url: notificationUrl } : {}),
        statement_descriptor: 'CARNICERIA',
      },
    })

    if (!preference.id || !preference.init_point) {
      return jsonResponse({ ok: false, error: 'Mercado Pago no devolvió la preferencia.' })
    }

    const { error: errorUpdate } = await supabase
      .from('pedidos_online')
      .update({ mercadopago_preference_id: preference.id })
      .eq('id', pedido.id)

    if (errorUpdate) {
      return jsonResponse({ ok: false, error: errorUpdate.message })
    }

    return jsonResponse({ ok: true, init_point: preference.init_point, preference_id: preference.id })
  } catch (e) {
    // El SDK de MP tira objetos con { message, cause } -- se devuelve el
    // mensaje para que quede visible en el checkout y en los logs.
    console.error(e)
    return jsonResponse({ ok: false, error: (e as Error)?.message ?? 'Error inesperado al crear la preferencia.' })
  }
})
