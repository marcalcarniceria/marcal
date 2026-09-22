export function ProductoCard({ producto, agregarItem, className = '' }) {
  return (
    <div className={`tienda-card ${className}`.trim()}>
      <h3>{producto.nombre}</h3>
      {producto.unidades_venta_producto?.map((unidad) => (
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
      ))}
    </div>
  )
}
