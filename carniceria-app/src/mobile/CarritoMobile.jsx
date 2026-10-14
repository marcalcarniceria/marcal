import { useNavigate } from 'react-router-dom'
import { useCarrito } from '../pages/tienda/CarritoContext'
import { MobileScreenHeader } from './MobileScreenHeader'
import { fmtPrecio, esUnidadKg } from './mobileFormato'
import './mobile.css'

export function CarritoMobile() {
  const navigate = useNavigate()
  const { items, actualizarCantidad, quitarItem, totalCarrito } = useCarrito()

  function cambiarCantidad(item, direccion) {
    const kg = esUnidadKg(item.unidad_nombre)
    const paso = kg ? 0.5 : 1
    const nueva = +(item.cantidad + direccion * paso).toFixed(2)
    if (nueva <= 0) quitarItem(item.clave)
    else actualizarCantidad(item.clave, nueva)
  }

  return (
    <div className="mob-app">
      <MobileScreenHeader titulo="Tu carrito" onBack={() => navigate('/tienda')} />

      {items.length === 0 ? (
        <div className="mob-cart-vacio">
          <div className="mob-titulo">Tu carrito está vacío</div>
          <p>Agregá carne, verdura o un combo para empezar.</p>
          <button type="button" className="mob-add-btn mob-cart-vacio-btn" onClick={() => navigate('/tienda')}>
            Ver productos
          </button>
        </div>
      ) : (
        <>
          <div className="mob-cart-lista">
            {items.map((item) => (
              <div key={item.clave} className="mob-cart-linea">
                <div className="mob-cart-linea-imagen">
                  {item.imagen_url ? (
                    <img src={item.imagen_url} alt={item.producto_nombre} />
                  ) : (
                    <img className="mob-cart-linea-imagen-vacia" src="/images/logo-marcal.png" alt="" />
                  )}
                </div>
                <div className="mob-cart-linea-info">
                  <div className="mob-cart-linea-top">
                    <div>
                      <div className="mob-cart-linea-nombre">{item.producto_nombre}</div>
                      <div className="mob-cart-linea-sub">{item.unidad_nombre}</div>
                    </div>
                    <div className="mob-cart-linea-total">{fmtPrecio(item.cantidad * item.precio_venta)}</div>
                  </div>
                  <div className="mob-cart-linea-bottom">
                    <div className="mob-qty-stepper">
                      <button type="button" onClick={() => cambiarCantidad(item, -1)}>
                        −
                      </button>
                      <span>{item.cantidad}</span>
                      <button type="button" onClick={() => cambiarCantidad(item, 1)}>
                        +
                      </button>
                    </div>
                    <button type="button" className="mob-cart-quitar" onClick={() => quitarItem(item.clave)}>
                      Quitar
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <button type="button" className="mob-seguir-comprando" onClick={() => navigate('/tienda')}>
              + Seguir comprando
            </button>

            <div className="mob-cart-resumen">
              <div>
                <span>Subtotal</span>
                <span>{fmtPrecio(totalCarrito)}</span>
              </div>
              <div className="mob-cart-resumen-muted">
                <span>Envío</span>
                <span>Según tu zona</span>
              </div>
              <p className="mob-cart-resumen-aviso">
                Los productos por kilo se pesan al momento; el total puede variar levemente.
              </p>
            </div>
          </div>

          <div className="mob-action-bar">
            <div className="mob-action-bar-total">
              <span>Subtotal ({items.length} {items.length === 1 ? 'producto' : 'productos'})</span>
              <span>{fmtPrecio(totalCarrito)}</span>
            </div>
            <button type="button" className="mob-action-btn" onClick={() => navigate('/tienda/checkout')}>
              Continuar con la compra
            </button>
          </div>
        </>
      )}
    </div>
  )
}
