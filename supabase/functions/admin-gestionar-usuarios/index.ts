// Edge Function: admin-gestionar-usuarios
//
// Única función de este proyecto que usa la SERVICE ROLE KEY -- hace
// falta porque crear un usuario de Auth para otra persona (sin que esa
// persona haga su propio signup) y banear/desbanear su acceso son
// operaciones que la clave anónima no puede hacer, por diseño de
// Supabase Auth.
//
// Body esperado (uno de los dos, campo "accion"):
//   { accion: "crear_empleado", nombre, email, rol, sucursal_id, password? }
//     -- password es opcional: si no se manda (o tiene menos de 8
//     caracteres), se genera una automática y se devuelve UNA SOLA VEZ
//     en la respuesta (nunca se guarda en ningún lado).
//   { accion: "cambiar_activo", usuario_id, activo: true|false }
//     -- además de actualizar usuarios.activo, banea/desbanea el acceso
//     a Auth (si no, "desactivar" sería solo cosmético: el empleado
//     podría seguir iniciando sesión igual).
//
// Respuesta: siempre HTTP 200 con { ok: boolean, ... } para errores de
// negocio (mismo criterio que calcular_distancia_zona), excepto 401
// real si quien llama no está autenticado o no es dueño -- ESA es la
// única barrera real contra que cualquiera cree cuentas, así que se
// chequea ANTES de leer el body o tocar la service role key.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROLES_VALIDOS = ['dueño', 'cajero', 'carnicero', 'verdulero', 'repartidor']

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function unauthorizedResponse() {
  return new Response(JSON.stringify({ ok: false, error: 'No autorizado.' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function generarPassword() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  for (const b of bytes) out += alfabeto[b % alfabeto.length]
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    // Chequeo de auth PRIMERO -- antes de leer el body, antes de crear
    // el cliente con la service role key.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return unauthorizedResponse()

    const supabaseCaller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: userData, error: errorUser } = await supabaseCaller.auth.getUser()
    if (errorUser || !userData?.user) return unauthorizedResponse()

    // Quien llama tiene que ser dueño -- se verifica leyendo SU PROPIA
    // fila en `usuarios` con el cliente anon (permitido por la policy
    // "usuarios_select_propio", no hace falta la service role todavía).
    const { data: filaCaller, error: errorCaller } = await supabaseCaller
      .from('usuarios')
      .select('rol')
      .eq('id', userData.user.id)
      .maybeSingle()

    if (errorCaller || filaCaller?.rol !== 'dueño') return unauthorizedResponse()

    const body = await req.json().catch(() => ({}))
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    if (body.accion === 'crear_empleado') {
      const nombre = String(body.nombre ?? '').trim()
      const email = String(body.email ?? '').trim()
      const rol = String(body.rol ?? '')
      const sucursalId = body.sucursal_id

      if (!nombre) return jsonResponse({ ok: false, error: 'Falta el nombre.' })
      if (!email) return jsonResponse({ ok: false, error: 'Falta el email.' })
      if (!ROLES_VALIDOS.includes(rol)) return jsonResponse({ ok: false, error: 'Rol inválido.' })
      if (!sucursalId) return jsonResponse({ ok: false, error: 'Falta la sucursal.' })

      const passwordIngresada = typeof body.password === 'string' ? body.password.trim() : ''
      if (passwordIngresada && passwordIngresada.length < 8) {
        return jsonResponse({ ok: false, error: 'La contraseña tiene que tener al menos 8 caracteres.' })
      }
      const passwordGenerada = !passwordIngresada
      const password = passwordIngresada || generarPassword()

      const { data: nuevoAuth, error: errorAuth } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

      if (errorAuth || !nuevoAuth?.user) {
        return jsonResponse({ ok: false, error: errorAuth?.message ?? 'No se pudo crear el usuario.' })
      }

      const { data: filaUsuario, error: errorInsert } = await supabaseAdmin
        .from('usuarios')
        .insert({ id: nuevoAuth.user.id, nombre, rol, sucursal_id: sucursalId, activo: true })
        .select()
        .single()

      if (errorInsert) {
        // Compensación: no dejar un usuario de Auth huérfano sin fila
        // en `usuarios` (quedaría "medio creado" y confundiría cualquier
        // intento posterior de dar de alta a esa misma persona).
        await supabaseAdmin.auth.admin.deleteUser(nuevoAuth.user.id)
        return jsonResponse({ ok: false, error: errorInsert.message })
      }

      return jsonResponse({
        ok: true,
        usuario: filaUsuario,
        password_generada: passwordGenerada ? password : null,
      })
    }

    if (body.accion === 'cambiar_activo') {
      const usuarioId = body.usuario_id
      const activo = Boolean(body.activo)

      if (!usuarioId) return jsonResponse({ ok: false, error: 'Falta usuario_id.' })
      if (usuarioId === userData.user.id && !activo) {
        return jsonResponse({ ok: false, error: 'No podés desactivarte a vos mismo.' })
      }

      const { error: errorUpdate } = await supabaseAdmin
        .from('usuarios')
        .update({ activo })
        .eq('id', usuarioId)

      if (errorUpdate) return jsonResponse({ ok: false, error: errorUpdate.message })

      // ban_duration bloquea logins/renovación de sesión nuevos -- una
      // sesión ya abierta en ese momento puede seguir activa hasta que
      // su token expire (normalmente ~1h), no es un corte instantáneo.
      const { error: errorBan } = await supabaseAdmin.auth.admin.updateUserById(usuarioId, {
        ban_duration: activo ? 'none' : '87600h',
      })

      if (errorBan) {
        return jsonResponse({
          ok: false,
          error: `Se guardó el estado pero falló bloquear/desbloquear el acceso: ${errorBan.message}`,
        })
      }

      return jsonResponse({ ok: true })
    }

    return jsonResponse({ ok: false, error: 'Acción desconocida.' })
  } catch (e) {
    return jsonResponse({ ok: false, error: (e as Error).message ?? 'Error inesperado.' })
  }
})
