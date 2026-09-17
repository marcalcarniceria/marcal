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
