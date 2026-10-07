import { supabase } from '../supabaseClient'

const MAX_BYTES = 2 * 1024 * 1024
const TIPOS_VALIDOS = ['image/jpeg', 'image/png', 'image/webp']

// Valida ANTES de intentar subir nada -- el input ya filtra con accept,
// pero accept es solo una sugerencia del selector de archivos, no una
// garantía (el usuario puede forzar otro tipo), así que se revisa igual acá.
export function validarImagen(file) {
  if (!TIPOS_VALIDOS.includes(file.type)) {
    return 'Formato no permitido. Usá una imagen JPG, PNG o WEBP.'
  }
  if (file.size > MAX_BYTES) {
    return 'La imagen es muy pesada, probá con una más chica (máximo 2 MB).'
  }
  return null
}

function extensionDeArchivo(file) {
  const porTipo = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  return porTipo[file.type] ?? file.name.split('.').pop().toLowerCase()
}

// El bucket "productos" es público, así que la URL es siempre previsible
// a partir del path -- se guarda la URL completa (así el frontend de la
// tienda no necesita saber nada de Storage), pero acá hace falta poder ir
// de URL a path de nuevo para borrar el archivo viejo al reemplazar o
// quitar una imagen. Compartido entre productos y combos: ambos usan el
// mismo bucket, solo cambia el prefijo del nombre de archivo.
function pathDesdeUrlImagen(url) {
  const marca = '/object/public/productos/'
  const i = url.indexOf(marca)
  return i === -1 ? null : url.slice(i + marca.length)
}

// `prefijo` distingue de qué entidad es la imagen dentro del mismo bucket
// (ej: id del producto o "combo-<id>") -- solo afecta el nombre de
// archivo, no los permisos (la policy de Storage es por bucket, no por
// prefijo).
export async function subirImagen(prefijo, file) {
  const ext = extensionDeArchivo(file)
  const path = `${prefijo}-${Date.now()}.${ext}`

  const { error } = await supabase.storage.from('productos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from('productos').getPublicUrl(path)
  return data.publicUrl
}

// Best-effort: si falla borrar el archivo viejo no es grave (queda un
// archivo huérfano en Storage, nada más) -- nunca debe cortar el
// guardado por esto.
export async function borrarImagenAnterior(urlVieja) {
  const path = pathDesdeUrlImagen(urlVieja)
  if (!path) return
  await supabase.storage.from('productos').remove([path]).catch(() => {})
}
