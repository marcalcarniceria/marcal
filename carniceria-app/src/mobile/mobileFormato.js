// Helpers de formato compartidos entre CatalogoMobile y
// ProductoDetalleMobile -- nada de esto es lógica de negocio real (esa
// sigue viviendo en los hooks compartidos con compu), son solo
// formatters visuales propios de esta UI.

export function fmtPrecio(n) {
  return `$${Math.round(Number(n)).toLocaleString('es-AR')}`
}

export function esUnidadKg(nombreUnidad) {
  return (nombreUnidad ?? '').toLowerCase().includes('kilo')
}

export function sufijoUnidad(nombreUnidad) {
  return esUnidadKg(nombreUnidad) ? '/ kg' : `/ ${(nombreUnidad ?? '').toLowerCase()}`
}

export function normalizar(texto) {
  return (texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function fmtCantidad(cantidad, esKg) {
  if (!esKg) return `${cantidad} ${cantidad === 1 ? 'unidad' : 'unidades'}`
  return cantidad < 1 ? `${Math.round(cantidad * 1000)} g` : `${String(+cantidad.toFixed(2)).replace('.', ',')} kg`
}
