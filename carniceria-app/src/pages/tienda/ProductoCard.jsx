// Bloqueo total (no parcial) cuando el stock está por debajo del mínimo
// configurado en el producto -- calculado acá mismo al vuelo con los dos
// números que ya vienen en `producto`, nunca guardado ni cacheado. Es
// exclusivo del canal online: el cajero (Cajero.jsx) no usa este
// componente y sigue vendiendo con total normalidad.
function esStockBajo(producto) {
  return Number(producto.stock_actual_unidad_base) < Number(producto.stock_minimo)
}

export function ProductoCard({ producto, agregarItem, className = '' }) {
  const bloqueado = esStockBajo(producto)

  return (
    <div className={`tienda-card ${bloqueado ? 'tienda-card-bloqueada' : ''} ${className}`.trim()}>
      <h3>{producto.nombre}</h3>

      {bloqueado ? (
        <p className="tienda-card-no-disponible">No disponible por el momento</p>
      ) : (
        producto.unidades_venta_producto?.map((unidad) => (
          <div key={unidad.id} className="tienda-card-unidad">
            <div>
              <div className="tienda-card-unidad-nombre">{unidad.nombre_unidad}</div>
              <div className="tienda-card-precio">${Number(unidad.precio_venta).toFixed(2)}</div>
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
                  precio_venta: Number(unidad.precio_venta),
                })
              }
            >
              Agregar
            </button>
          </div>
        ))
      )}
    </div>
  )
}
