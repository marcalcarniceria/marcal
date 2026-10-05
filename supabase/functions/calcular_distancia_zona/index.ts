// Edge Function: calcular_distancia_zona
//
// Recibe uno o varios nombres de barrio y devuelve, para cada uno, la
// distancia por calle en km desde el local (Arenales 345, Barrio
// Juniors, Córdoba) hasta ese barrio -- geocodificado con la API de
// OpenRouteService.
//
// La API key de OpenRouteService vive ACÁ (secret de la función,
// ORS_API_KEY), nunca en el frontend -- este archivo nunca debe
// hardcodearla, se lee siempre de Deno.env.
//
// Body esperado (uno de los dos):
//   { "nombre_zona": "Alta Córdoba, Córdoba, Argentina" }
//   { "nombres_zona": ["Alta Córdoba, Córdoba, Argentina", "Nueva Córdoba, Córdoba, Argentina"] }
//
// Respuesta (siempre un array, incluso para un solo nombre):
//   {
//     "ok": true,
//     "resultados": [
//       { "nombre_zona": "...", "encontrado": true, "distancia_km": 12.34,
//         "label": "Alta Córdoba, CD, Argentina", "confidence": 1 },
//       { "nombre_zona": "...", "encontrado": false,
//         "error": "No se encontró esa zona. Cargá la distancia a mano." }
//     ]
//   }
// Si algo falla de forma general (sin origen configurado, API caída,
// límite diario agotado), responde { "ok": false, "error": "..." } --
// nunca tira una excepción sin manejar, para que el frontend siempre
// tenga un mensaje claro y pueda dejar completar la zona a mano.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Caja delimitadora del Gran Córdoba -- fuerza a que el geocoder
// devuelva resultados de la ciudad y alrededores, no de otra "Alta
// Córdoba" en cualquier lado del país (probado: sin esto, direcciones
// ambiguas devolvían coincidencias a cientos de km de distancia).
const CAJA_CORDOBA = {
  minLon: -64.35,
  maxLon: -63.95,
  minLat: -31.55,
  maxLat: -31.25,
}

// Siempre HTTP 200: el frontend distingue éxito/error leyendo el campo
// `ok` del body, no el status code -- así supabase-js no lo trata como
// FunctionsHttpError (que oculta el body real) y el manejo queda
// uniforme en un solo lugar en vez de tener que leer error.context.
function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// A diferencia de jsonResponse (siempre 200, para resultados de
// negocio), esto SÍ es un 401 real -- es el único punto de la función
// que decide si se ejecuta o no, y queremos que se vea distinto en
// logs/monitoreo de cualquier otra respuesta.
function unauthorizedResponse() {
  return new Response(JSON.stringify({ ok: false, error: 'No autorizado.' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function geocodificar(nombreZona: string, apiKey: string) {
  const params = new URLSearchParams({
    api_key: apiKey,
    text: nombreZona,
    size: '1',
    'boundary.country': 'AR',
    'boundary.rect.min_lon': String(CAJA_CORDOBA.minLon),
    'boundary.rect.max_lon': String(CAJA_CORDOBA.maxLon),
    'boundary.rect.min_lat': String(CAJA_CORDOBA.minLat),
    'boundary.rect.max_lat': String(CAJA_CORDOBA.maxLat),
  })

  const res = await fetch(`https://api.openrouteservice.org/geocode/search?${params}`)

  if (res.status === 429) {
    throw new Error('Se agotó el límite diario de geocodificación de OpenRouteService. Probá de nuevo más tarde o cargá la distancia a mano.')
  }
  if (!res.ok) {
    throw new Error(`OpenRouteService (geocode) respondió ${res.status}`)
  }

  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) return null

  const [lng, lat] = feature.geometry.coordinates
  return {
    lat,
    lng,
    label: feature.properties?.label ?? nombreZona,
    confidence: feature.properties?.confidence ?? null,
  }
}

async function calcularDistancias(
  origen: { lat: number; lng: number },
  destinos: { lat: number; lng: number }[],
  apiKey: string,
) {
  if (destinos.length === 0) return []

  const locations = [[origen.lng, origen.lat], ...destinos.map((d) => [d.lng, d.lat])]
  const destinationsIdx = destinos.map((_, i) => i + 1)

  const res = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      locations,
      sources: [0],
      destinations: destinationsIdx,
      metrics: ['distance'],
      units: 'km',
    }),
  })

  if (res.status === 429) {
    throw new Error('Se agotó el límite diario de cálculo de distancias de OpenRouteService. Probá de nuevo más tarde o cargá la distancia a mano.')
  }
  if (!res.ok) {
    throw new Error(`OpenRouteService (matrix) respondió ${res.status}`)
  }

  const data = await res.json()
  return data.distances[0] as number[]
}

Deno.serve(async (req) => {
  // Preflight: el navegador manda esto ANTES de la petición real (que
  // sí lleva Authorization/apikey), así que este bloque tiene que
  // responder rápido, con status explícito 200 y los headers de CORS,
  // antes de leer body/env/nada -- cualquier lógica antes de este
  // chequeo puede hacer que el preflight tarde o falle.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    // Chequeo explícito de auth -- PRIMERO, antes de leer body, antes
    // de tocar config_envios, antes de gastar un solo request de ORS.
    // Con "Enforce JWT Verification" desactivado en el gateway (hace
    // falta para que el preflight OPTIONS no se rechace solo), esta es
    // la ÚNICA barrera real contra que cualquiera en internet golpee
    // la URL y gaste el cupo diario -- no puede depender de un efecto
    // colateral de RLS en otra tabla.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return unauthorizedResponse()
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: userData, error: errorUser } = await supabase.auth.getUser()
    if (errorUser || !userData?.user) {
      return unauthorizedResponse()
    }

    const apiKey = Deno.env.get('ORS_API_KEY')
    if (!apiKey) {
      return jsonResponse({ ok: false, error: 'Falta configurar ORS_API_KEY en los secrets de la función.' })
    }

    const body = await req.json().catch(() => ({}))
    const nombres: string[] = Array.isArray(body.nombres_zona)
      ? body.nombres_zona.filter((n: unknown) => typeof n === 'string' && n.trim())
      : typeof body.nombre_zona === 'string' && body.nombre_zona.trim()
        ? [body.nombre_zona]
        : []

    if (nombres.length === 0) {
      return jsonResponse({ ok: false, error: 'Falta nombre_zona o nombres_zona.' })
    }

    const { data: config, error: errorConfig } = await supabase
      .from('config_envios')
      .select('origen_lat, origen_lng')
      .maybeSingle()

    if (errorConfig) {
      return jsonResponse({ ok: false, error: errorConfig.message })
    }
    if (!config || config.origen_lat == null || config.origen_lng == null) {
      return jsonResponse({
        ok: false,
        error: 'Falta configurar las coordenadas de origen del local en Zonas de envío.',
      })
    }

    const origen = { lat: Number(config.origen_lat), lng: Number(config.origen_lng) }

    // 1) Geocodificar cada nombre (una llamada por barrio -- la API de
    //    Geocode Search no tiene modo bulk). Secuencial, no en paralelo:
    //    con una carga masiva de muchos barrios, disparar todo junto
    //    puede pegarle a un límite de ráfaga por segundo aunque el cupo
    //    diario alcance.
    const geocodificados: { nombre: string; resultado: Awaited<ReturnType<typeof geocodificar>>; error: string | null }[] = []
    for (const nombre of nombres) {
      try {
        const resultado = await geocodificar(nombre, apiKey)
        geocodificados.push({ nombre, resultado, error: null })
      } catch (e) {
        geocodificados.push({ nombre, resultado: null, error: (e as Error).message })
      }
    }

    const encontrados = geocodificados.filter((g) => g.resultado && !g.error)

    // 2) Una sola llamada a Matrix para TODOS los encontrados a la vez
    //    (ahorra cupo diario en vez de una llamada por zona).
    let distancias: number[] = []
    let errorMatrix: string | null = null
    if (encontrados.length > 0) {
      try {
        distancias = await calcularDistancias(
          origen,
          encontrados.map((g) => g.resultado!),
          apiKey,
        )
      } catch (e) {
        errorMatrix = (e as Error).message
      }
    }

    const resultados = geocodificados.map((g) => {
      if (g.error) {
        return { nombre_zona: g.nombre, encontrado: false, error: g.error }
      }
      if (!g.resultado) {
        return {
          nombre_zona: g.nombre,
          encontrado: false,
          error: 'No se encontró esa zona. Cargá la distancia a mano.',
        }
      }
      if (errorMatrix) {
        return { nombre_zona: g.nombre, encontrado: false, error: errorMatrix }
      }

      const idx = encontrados.findIndex((e) => e.nombre === g.nombre)
      return {
        nombre_zona: g.nombre,
        encontrado: true,
        distancia_km: Math.round(distancias[idx] * 100) / 100,
        label: g.resultado.label,
        confidence: g.resultado.confidence,
      }
    })

    return jsonResponse({ ok: true, resultados })
  } catch (e) {
    return jsonResponse({ ok: false, error: (e as Error).message ?? 'Error inesperado.' })
  }
})
