import { esStockBajo } from './stock'

// null = sin promo. Misma regla que crear_pedido_online
// (coalesce(precio_promocional, precio_venta)): lo que se muestra acá es
// lo que después se cobra.
function precioPromocional(unidad) {
  return unidad.precio_promocional == null ? null : Number(unidad.precio_promocional)
}

export function ProductoCard({ producto, agregarItem, className = '' }) {
  const bloqueado = esStockBajo(producto)
  const enOferta =
    !bloqueado && producto.unidades_venta_producto?.some((u) => precioPromocional(u) !== null)

  return (
    <div className={`tienda-card ${bloqueado ? 'tienda-card-bloqueada' : ''} ${className}`.trim()}>
      {enOferta && <span className="tienda-card-oferta">Oferta</span>}
      <h3>{producto.nombre}</h3>

      {bloqueado ? (
        <p className="tienda-card-no-disponible">No disponible por el momento</p>
      ) : (
        producto.unidades_venta_producto?.map((unidad) => {
          const precioNormal = Number(unidad.precio_venta)
          const promo = precioPromocional(unidad)
          const descuento = promo !== null ? Math.round((1 - promo / precioNormal) * 100) : 0

          return (
            <div key={unidad.id} className="tienda-card-unidad">
              <div>
                <div className="tienda-card-unidad-nombre">{unidad.nombre_unidad}</div>
                {promo !== null ? (
                  <div className="tienda-card-precios">
                    <s className="tienda-card-precio-original">${precioNormal.toFixed(2)}</s>
                    <span className="tienda-card-precio tienda-card-precio-promo">
                      ${promo.toFixed(2)}
                    </span>
                    {descuento > 0 && <span className="tienda-card-descuento">-{descuento}%</span>}
                  </div>
                ) : (
                  <div className="tienda-card-precio">${precioNormal.toFixed(2)}</div>
                )}
              </div>
              <button
                type="button"
                className="tienda-btn"
                onClick={() =>
                  agregarItem({
                    producto_id: producto.id,
                    producto_nombre: producto.nombre,
                    unidad_venta_id: unidad.id,
                    unidad_nombre: unidad.nombre_unidad,
                    // El carrito usa precio_venta como "precio a cobrar".
                    precio_venta: promo ?? precioNormal,
                  })
                }
              >
                Agregar
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}
