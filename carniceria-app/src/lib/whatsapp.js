export function soloDigitosTelefono(telefono) {
  return (telefono ?? '').replace(/[^0-9]/g, '')
}

// wa.me necesita el número completo con código de país (ej: 549351...,
// sin +, espacios ni guiones). Un teléfono local de 10 dígitos sin
// código de país generaría un link roto, así que se exige más largo.
export function telefonoValidoWhatsApp(telefono) {
  return /^\d{12,15}$/.test(soloDigitosTelefono(telefono))
}

export function linkWhatsApp(telefono, mensaje) {
  const numero = soloDigitosTelefono(telefono)
  return mensaje ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : `https://wa.me/${numero}`
}

// Número argentino -> formato wa.me (549 + área + número, sin el 15).
// A diferencia de telefonoValidoWhatsApp (que exige el número completo
// con código de país), acepta como se suele cargar en el mostrador:
//   "351 386-6592" | "0351 15 386-6592" | "+54 9 351 386-6592" | "54 351 3866592"
// Devuelve null si no se puede interpretar (el botón queda deshabilitado).
export function telefonoArgentinoWhatsApp(telefono) {
  let d = soloDigitosTelefono(telefono)
  if (!d) return null

  if (d.startsWith('549')) d = d.slice(3)
  else if (d.startsWith('54')) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)

  // "0351 15 3866592" -> área + 15 + número: se quita el 15 (wa.me no lo usa).
  // Áreas de 2 a 4 dígitos: se busca un "15" después del área que deje
  // exactamente 10 dígitos.
  if (d.length === 12) {
    for (const largoArea of [2, 3, 4]) {
      if (d.slice(largoArea, largoArea + 2) === '15') {
        d = d.slice(0, largoArea) + d.slice(largoArea + 2)
        break
      }
    }
  }

  return d.length === 10 ? `549${d}` : null
}
