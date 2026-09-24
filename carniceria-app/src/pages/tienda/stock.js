// Bloqueo total (no parcial) cuando el stock está por debajo del mínimo
// configurado en el producto -- calculado al vuelo con los dos números que
// ya vienen en `producto`, nunca guardado ni cacheado. Es exclusivo del
// canal online: el cajero (Cajero.jsx) no lo usa y sigue vendiendo con
// total normalidad.
//
// Lo usan ProductoCard (muestra "No disponible por el momento") y Tienda
// (deja afuera de Promociones a los bloqueados): una sola regla para los dos.
export function esStockBajo(producto) {
  return Number(producto.stock_actual_unidad_base) < Number(producto.stock_minimo)
}
