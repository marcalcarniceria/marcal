// Precio para mostrar en la tienda (compu), formato argentino:
//   4840     -> "$4.840"        (sin ",00" si es entero)
//   24200    -> "$24.200"
//   1234.5   -> "$1.234,50"     (si tiene centavos, se muestran los dos)
// A diferencia de fmtPrecio (mobile/mobileFormato.js), NO redondea al
// entero: un precio por kilo con centavos se muestra tal cual.
export function formatoPrecio(valor) {
  const n = Number(valor) || 0
  const esEntero = Math.round(n * 100) % 100 === 0
  return `$${n.toLocaleString('es-AR', {
    minimumFractionDigits: esEntero ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}
