import { useNavigate } from 'react-router-dom'
import { useCarrito } from './CarritoContext'
import { TiendaHeader } from './TiendaHeader'

export function Carrito() {
  const { items, actualizarCantidad, quitarItem, totalCarrito } = useCarrito()
  const navigate = useNavigate()

  return (
    <>
      <TiendaHeader />
      <div className="tienda-contenido" style={{ maxWidth: 640 }}>
        <h1>Carrito</h1>

        {items.length === 0 && (
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <p>Tu carrito está vacío.</p>
            <button
              type="button"
              className="tienda-btn"
              style={{ marginTop: '0.75rem' }}
              onClick={() => navigate('/tienda')}
            >
              Volver a ver productos
            </button>
          </div>
        )}

        {items.length > 0 && (
          <>
            <button
              type="button"
              className="tienda-btn tienda-btn-secundario"
              style={{ margin: '0.75rem 0 1.25rem' }}
              onClick={() => navigate('/tienda')}
            >
              ← Seguir comprando
            </button>

            <table className="tienda-tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Precio</th>
                  <th>Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.clave}>
                    <td>
                      {item.producto_nombre} ({item.unidad_nombre})
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.cantidad}
                        onChange={(e) =>
                          actualizarCantidad(item.clave, Math.max(1, Number(e.target.value)))
                        }
                      />
                    </td>
                    <td>${item.precio_venta.toFixed(2)}</td>
                    <td>${(item.cantidad * item.precio_venta).toFixed(2)}</td>
                    <td>
                      <button
                        type="button"
                        className="tienda-btn tienda-btn-secundario"
                        onClick={() => quitarItem(item.clave)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="tienda-resumen">
              <p className="tienda-total-row">
                <span>Total productos</span>
                <span>${totalCarrito.toFixed(2)}</span>
              </p>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              El costo de envío se calcula en el siguiente paso.
            </p>

            <button type="button" className="tienda-btn" onClick={() => navigate('/tienda/checkout')}>
              Continuar
            </button>
          </>
        )}
      </div>
    </>
  )
}
