import { esUnidadKg } from '../../mobile/mobileFormato'

const CANTIDAD_MINIMA = 0.1
// Mismo tope que crear_pedido_online.
const CANTIDAD_MAXIMA = 200

// Qué se cobra y qué se muestra tachado en una unidad de venta.
//
// cobrar sigue la misma regla que crear_pedido_online
// (coalesce(precio_promocional, precio_venta)): lo que se muestra es lo que
// después se cobra. precio_anterior nunca cambia ese monto, solo se muestra
// (ver schema_precio_anterior.sql).
//
// tachado: null = sin oferta. directa: la rebaja viene de precio_anterior.
// Si la unidad tiene las dos, manda la promo porque es lo que se cobra.
export function preciosDeUnidad(unidad) {
  const venta = Number(unidad.precio_venta)

  if (unidad.precio_promocional != null) {
    const promo = Number(unidad.precio_promocional)
    return { cobrar: promo, tachado: venta, directa: false, descuento: porcentaje(venta, promo) }
  }

  const anterior = unidad.precio_anterior == null ? null : Number(unidad.precio_anterior)
  if (anterior !== null && anterior > venta) {
    return { cobrar: venta, tachado: anterior, directa: true, descuento: porcentaje(anterior, venta) }
  }

  return { cobrar: venta, tachado: null, directa: false, descuento: 0 }
}

function porcentaje(anterior, actual) {
  return Math.round(((anterior - actual) / anterior) * 100)
}

// La promo por volumen solo rige si conviene frente al precio normal: una baja
// de precios no puede dejar a nadie pagando de más por llevar más.
function promoVigente(precioBase, cantidadPromocion, precioPromocion) {
  const cantidad = Number(cantidadPromocion)
  const precio = Number(precioPromocion)
  return cantidad > 0 && precio > 0 && precio < cantidad * precioBase
}

// null = sin promo. Para el texto "Promo: 2 Kg x $3999".
export function promoDeUnidad(unidad) {
  const { cobrar } = preciosDeUnidad(unidad)
  if (!promoVigente(cobrar, unidad.cantidad_promocion, unidad.precio_promocion_volumen)) return null
  return { cantidad: Number(unidad.cantidad_promocion), precio: Number(unidad.precio_promocion_volumen) }
}

// Lo que un renglón del carrito necesita para calcular su subtotal.
export function camposPromoDeUnidad(unidad) {
  const promo = promoDeUnidad(unidad)
  return { cantidad_promocion: promo?.cantidad ?? null, precio_promocion_volumen: promo?.precio ?? null }
}

// Misma cuenta que crear_pedido_online: tandas enteras al precio de la promo y
// el resto al precio normal. Se hace en milésimas porque con decimales % falla
// (0.3 % 0.1 da 0.0999... en vez de 0) y el total no coincidiría con el cobro.
export function subtotalLinea(cantidad, precioBase, cantidadPromocion, precioPromocion) {
  if (!promoVigente(precioBase, cantidadPromocion, precioPromocion) || cantidad < Number(cantidadPromocion)) {
    return cantidad * precioBase
  }

  const milesimas = Math.round(cantidad * 1000)
  const milesimasPromo = Math.round(Number(cantidadPromocion) * 1000)
  const tandas = Math.floor(milesimas / milesimasPromo)
  const resto = (milesimas % milesimasPromo) / 1000

  return tandas * Number(precioPromocion) + resto * precioBase
}

export function subtotalItem(item) {
  return subtotalLinea(item.cantidad, item.precio_venta, item.cantidad_promocion, item.precio_promocion_volumen)
}

export function promoAplicada(item) {
  return subtotalItem(item) < item.cantidad * item.precio_venta
}

export function redondearCantidad(cantidad) {
  return Math.round(cantidad * 1000) / 1000
}

// null = no se puede pedir esa cantidad.
export function cantidadValida(valor) {
  const cantidad = redondearCantidad(Number(valor))
  return cantidad >= CANTIDAD_MINIMA && cantidad <= CANTIDAD_MAXIMA ? cantidad : null
}

export function etiquetaCantidad(nombreUnidad) {
  return esUnidadKg(nombreUnidad) ? 'Kg' : 'Unidad'
}
