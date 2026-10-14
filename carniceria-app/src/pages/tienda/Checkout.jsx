import { Link } from 'react-router-dom'
import { useCheckout } from './useCheckout'
import { TiendaHeader } from './TiendaHeader'

export function Checkout() {
  const {
    items,
    totalCarrito,
    zonas,
    zonaId,
    setZonaId,
    nombre,
    setNombre,
    telefono,
    setTelefono,
    direccion,
    setDireccion,
    notas,
    setNotas,
    metodoPago,
    setMetodoPago,
    setMetodoEntrega,
    enviando,
    error,
    esRetiro,
    costoEnvio,
    totalConEnvio,
    confirmarPedido,
  } = useCheckout()

  if (items.length === 0) {
    return (
      <>
        <TiendaHeader />
        <div className="tienda-contenido" style={{ maxWidth: 480 }}>
          <p>Tu carrito está vacío.</p>
          <Link to="/tienda" className="tienda-volver">
            ← Volver a la tienda
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <TiendaHeader />
      <div className="tienda-contenido" style={{ maxWidth: 480 }}>
        <h1>Checkout</h1>

        {/* 1. Toggle de tipo de entrega */}
        <div className="checkout-toggle-entrega">
          <button
            type="button"
            className={`checkout-toggle-btn${!esRetiro ? ' activo' : ''}`}
            onClick={() => setMetodoEntrega('envio')}
          >
            🛵 Envío a Domicilio
          </button>
          <button
            type="button"
            className={`checkout-toggle-btn${esRetiro ? ' activo' : ''}`}
            onClick={() => setMetodoEntrega('retiro')}
          >
            🏪 Retiro en el Local
          </button>
        </div>

        {/* 2. Formulario dinámico de datos */}
        <div className="tienda-form checkout-form">
          {esRetiro ? (
            <p className="checkout-retiro-info">Retirás tu pedido por nuestro local.</p>
          ) : (
            <label>
              Zona de envío
              <select value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre} — ${Number(z.costo_envio).toFixed(2)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Nombre y apellido
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>

          <label>
            Teléfono
            <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>

          {!esRetiro && (
            <label>
              Dirección de envío
              <input type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
            </label>
          )}

          <label>
            Notas (opcional)
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
          </label>
        </div>

        {/* 3. Selector de método de pago, apilado */}
        <div className="checkout-metodo-pago">
          <label className={`checkout-pago-card${metodoPago === 'efectivo' ? ' activo' : ''}`}>
            <input
              type="radio"
              name="metodoPago"
              value="efectivo"
              checked={metodoPago === 'efectivo'}
              onChange={() => setMetodoPago('efectivo')}
            />
            💵 Efectivo
          </label>
          <label className={`checkout-pago-card${metodoPago === 'mercadopago' ? ' activo' : ''}`}>
            <input
              type="radio"
              name="metodoPago"
              value="mercadopago"
              checked={metodoPago === 'mercadopago'}
              onChange={() => setMetodoPago('mercadopago')}
            />
            💳 Mercado Pago
          </label>
        </div>

        {/* 4. Resumen y avisos */}
        <div className="tienda-resumen">
          <p>
            <span>Productos</span>
            <span>${totalCarrito.toFixed(2)}</span>
          </p>
          <p>
            <span>Envío</span>
            <span>{esRetiro ? 'Sin costo (retiro)' : `$${costoEnvio.toFixed(2)}`}</span>
          </p>
          <p className="tienda-total-row">
            <span>Total</span>
            <span>${totalConEnvio.toFixed(2)}</span>
          </p>
        </div>

        {error && <p className="tienda-error">{error}</p>}

        <p className="tienda-aviso">
          {metodoPago === 'efectivo'
            ? 'Pagás en efectivo cuando recibas o retires el pedido. No hace falta pagar nada ahora.'
            : 'Al confirmar, te llevamos a Mercado Pago para completar el pago de forma segura.'}
        </p>

        <button type="button" className="tienda-btn" onClick={confirmarPedido} disabled={enviando}>
          {enviando
            ? metodoPago === 'mercadopago'
              ? 'Redirigiendo a Mercado Pago...'
              : 'Enviando...'
            : metodoPago === 'mercadopago'
              ? 'Pagar con Mercado Pago'
              : 'Confirmar pedido'}
        </button>
      </div>
    </>
  )
}
