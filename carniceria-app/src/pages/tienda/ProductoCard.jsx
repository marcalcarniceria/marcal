import { useState } from 'react'
import { esStockBajo } from './stock'
import { BotonAgregar } from './BotonAgregar'
import { InputCantidad } from './InputCantidad'
import { camposPromoDeUnidad, etiquetaCantidad, preciosDeUnidad, promoDeUnidad } from './precios'

function UnidadCard({ producto, unidad, agregarItem }) {
  const [cantidad, setCantidad] = useState(1)
  const { cobrar, tachado, directa, descuento } = preciosDeUnidad(unidad)
  const promo = promoDeUnidad(unidad)
  const etiqueta = etiquetaCantidad(unidad.nombre_unidad)

  return (
    <div className="tienda-card-unidad">
      <div>
        <div className="tienda-card-unidad-nombre">{unidad.nombre_unidad}</div>
        {tachado !== null ? (
          <div className={`tienda-card-precios${directa ? ' tienda-card-precios-directa' : ''}`}>
            <del className="tienda-card-precio-original">${tachado.toFixed(2)}</del>
            <span className="tienda-card-precio tienda-card-precio-promo">${cobrar.toFixed(2)}</span>
            {descuento > 0 && <span className="tienda-card-descuento">-{descuento}%</span>}
          </div>
        ) : (
          <div className="tienda-card-precio">${cobrar.toFixed(2)}</div>
        )}
        {promo && (
          <div className="tienda-card-promo-volumen">
            Promo: {promo.cantidad} {etiqueta} x ${promo.precio.toFixed(2)}
          </div>
        )}
      </div>
      <div className="tienda-card-compra">
        <label className="tienda-card-cantidad">
          <InputCantidad
            value={cantidad}
            onChange={setCantidad}
            aria-label={`Cantidad de ${producto.nombre}, ${unidad.nombre_unidad}`}
          />
          <span>{etiqueta}</span>
        </label>
        <BotonAgregar
          nombre={producto.nombre}
          onAgregar={() =>
            agregarItem(
              {
                producto_id: producto.id,
                producto_nombre: producto.nombre,
                unidad_venta_id: unidad.id,
                unidad_nombre: unidad.nombre_unidad,
                // El carrito usa precio_venta como "precio a cobrar".
                precio_venta: cobrar,
                ...camposPromoDeUnidad(unidad),
              },
              cantidad,
            )
          }
        />
      </div>
    </div>
  )
}

export function ProductoCard({ producto, agregarItem, className = '' }) {
  const bloqueado = esStockBajo(producto)
  const enOferta =
    !bloqueado && producto.unidades_venta_producto?.some((u) => preciosDeUnidad(u).tachado !== null)

  return (
    <div className={`tienda-card ${bloqueado ? 'tienda-card-bloqueada' : ''} ${className}`.trim()}>
      <div className="tienda-card-imagen">
        {producto.imagen_url ? (
          <img src={producto.imagen_url} alt={producto.nombre} loading="lazy" />
        ) : (
          <img
            className="tienda-card-imagen-placeholder"
            src="/images/logo-marcal.png"
            alt=""
            loading="lazy"
          />
        )}
      </div>
      {enOferta && <span className="tienda-card-oferta">Oferta</span>}
      <h3>{producto.nombre}</h3>

      {bloqueado ? (
        <p className="tienda-card-no-disponible">No disponible por el momento</p>
      ) : (
        producto.unidades_venta_producto?.map((unidad) => (
          <UnidadCard key={unidad.id} producto={producto} unidad={unidad} agregarItem={agregarItem} />
        ))
      )}
    </div>
  )
}
