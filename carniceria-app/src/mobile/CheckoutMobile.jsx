import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useCheckout } from '../pages/tienda/useCheckout'
import { MobileScreenHeader } from './MobileScreenHeader'
import { fmtPrecio } from './mobileFormato'
import './mobile.css'

const PASOS = ['Datos', 'Envío', 'Pago', 'Confirmar']

export function CheckoutMobile() {
  const navigate = useNavigate()
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

  const [step, setStep] = useState(1)
  const [errores, setErrores] = useState({})

  if (items.length === 0) {
    return (
      <div className="mob-app">
        <MobileScreenHeader titulo="Checkout" onBack={() => navigate('/tienda')} />
        <p className="mob-placeholder">
          Tu carrito está vacío. <Link to="/tienda">Volver a la tienda</Link>
        </p>
      </div>
    )
  }

  const zonaSeleccionada = zonas.find((z) => z.id === zonaId)

  function volver() {
    if (step > 1) {
      setStep(step - 1)
      setErrores({})
    } else {
      navigate('/tienda/carrito')
    }
  }

  function avanzar() {
    const err = {}
    if (step === 1) {
      if (!nombre.trim()) err.nombre = 1
      if (telefono.replace(/\D/g, '').length < 8) err.telefono = 1
    }
    if (step === 2 && !esRetiro) {
      if (!zonaId) err.zona = 1
      if (!direccion.trim()) err.direccion = 1
    }

    if (Object.keys(err).length) {
      setErrores(err)
      return
    }
    setErrores({})

    if (step < 4) {
      setStep(step + 1)
      return
    }
    confirmarPedido()
  }

  const etiquetaBoton =
    step < 4
      ? 'Continuar'
      : enviando
        ? metodoPago === 'mercadopago'
          ? 'Redirigiendo a Mercado Pago...'
          : 'Enviando...'
        : metodoPago === 'mercadopago'
          ? `Pagar ${fmtPrecio(totalConEnvio)} con Mercado Pago`
          : `Confirmar pedido · ${fmtPrecio(totalConEnvio)}`

  return (
    <div className="mob-app">
      <MobileScreenHeader titulo="Finalizar compra" onBack={volver} />

      <div className="mob-checkout-pasos">
        {PASOS.map((label, i) => (
          <div key={label} className="mob-checkout-paso">
            <div className={`mob-checkout-paso-barra${i + 1 <= step ? ' activo' : ''}`} />
            <span className={i + 1 === step ? 'activo' : ''}>{label}</span>
          </div>
        ))}
      </div>

      <div className="mob-checkout-body">
        {step === 1 && (
          <>
            <div className="mob-titulo">Tus datos</div>
            <label className="mob-campo">
              <span>Nombre y apellido</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Anna Sclejsher"
                className={errores.nombre ? 'mob-campo-error' : ''}
              />
              {errores.nombre && <span className="mob-campo-error-texto">Ingresá tu nombre.</span>}
            </label>
            <label className="mob-campo">
              <span>Celular (WhatsApp)</span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                inputMode="tel"
                placeholder="Ej: 351 380 0082"
                className={errores.telefono ? 'mob-campo-error' : ''}
              />
              {errores.telefono && <span className="mob-campo-error-texto">Ingresá un celular válido.</span>}
              <span className="mob-campo-ayuda">Te avisamos por acá cuando tu pedido salga.</span>
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <div className="mob-titulo">¿Dónde lo recibís?</div>
            <div className="mob-checkout-toggle">
              <button
                type="button"
                className={!esRetiro ? 'activo' : ''}
                onClick={() => setMetodoEntrega('envio')}
              >
                🛵 Envío a domicilio
              </button>
              <button
                type="button"
                className={esRetiro ? 'activo' : ''}
                onClick={() => setMetodoEntrega('retiro')}
              >
                🏪 Retiro en el local
              </button>
            </div>

            {!esRetiro && (
              <>
                <div className="mob-zonas">
                  {zonas.map((z) => (
                    <button
                      key={z.id}
                      type="button"
                      className={`mob-zona${zonaId === z.id ? ' activo' : ''}`}
                      onClick={() => setZonaId(z.id)}
                    >
                      <span className="mob-zona-dot" />
                      <span className="mob-zona-nombre">{z.nombre}</span>
                      <span className="mob-zona-precio">{fmtPrecio(z.costo_envio)}</span>
                    </button>
                  ))}
                </div>
                {errores.zona && <span className="mob-campo-error-texto">Elegí una opción de envío.</span>}

                <label className="mob-campo">
                  <span>Dirección de entrega</span>
                  <input
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Calle, número, piso/depto"
                    className={errores.direccion ? 'mob-campo-error' : ''}
                  />
                  {errores.direccion && <span className="mob-campo-error-texto">Ingresá la dirección.</span>}
                </label>
                <label className="mob-campo">
                  <span>
                    Indicaciones <small>(opcional)</small>
                  </span>
                  <input
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Ej: timbre 2B, portón verde"
                  />
                </label>
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <div className="mob-titulo">¿Cómo pagás?</div>
            <div className="mob-pagos">
              <button
                type="button"
                className={`mob-pago${metodoPago === 'mercadopago' ? ' activo' : ''}`}
                onClick={() => setMetodoPago('mercadopago')}
              >
                <span className="mob-zona-dot" />
                <span className="mob-pago-texto">
                  <strong>Mercado Pago</strong>
                  <span>Tarjeta de crédito, débito o dinero en cuenta. Al confirmar te llevamos a Mercado Pago.</span>
                </span>
                <span className="mob-pago-badge">ONLINE</span>
              </button>
              <button
                type="button"
                className={`mob-pago${metodoPago === 'efectivo' ? ' activo' : ''}`}
                onClick={() => setMetodoPago('efectivo')}
              >
                <span className="mob-zona-dot" />
                <span className="mob-pago-texto">
                  <strong>Efectivo al recibir</strong>
                  <span>Pagás cuando llega tu pedido o al retirarlo.</span>
                </span>
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="mob-titulo">Revisá tu pedido</div>
            <div className="mob-checkout-lineas">
              {items.map((i) => (
                <div key={i.clave}>
                  <span>
                    {i.producto_nombre} <span className="mob-muted">· {i.cantidad}</span>
                  </span>
                  <span>{fmtPrecio(i.cantidad * i.precio_venta)}</span>
                </div>
              ))}
            </div>

            <div className="mob-checkout-resumenrow">
              <div>
                <div className="mob-checkout-resumenrow-k">DATOS</div>
                <div className="mob-checkout-resumenrow-v">{nombre || '—'}</div>
                <div className="mob-checkout-resumenrow-v2">{telefono}</div>
              </div>
              <button type="button" onClick={() => setStep(1)}>
                Cambiar
              </button>
            </div>
            <div className="mob-checkout-resumenrow">
              <div>
                <div className="mob-checkout-resumenrow-k">ENVÍO</div>
                <div className="mob-checkout-resumenrow-v">
                  {esRetiro ? 'Retiro en el local' : zonaSeleccionada ? `${zonaSeleccionada.nombre} · ${fmtPrecio(costoEnvio)}` : '—'}
                </div>
                <div className="mob-checkout-resumenrow-v2">{!esRetiro && direccion}</div>
              </div>
              <button type="button" onClick={() => setStep(2)}>
                Cambiar
              </button>
            </div>
            <div className="mob-checkout-resumenrow">
              <div>
                <div className="mob-checkout-resumenrow-k">PAGO</div>
                <div className="mob-checkout-resumenrow-v">{metodoPago === 'mercadopago' ? 'Mercado Pago' : 'Efectivo al recibir'}</div>
              </div>
              <button type="button" onClick={() => setStep(3)}>
                Cambiar
              </button>
            </div>

            <div className="mob-cart-resumen">
              <div>
                <span>Subtotal</span>
                <span>{fmtPrecio(totalCarrito)}</span>
              </div>
              <div>
                <span>Envío</span>
                <span>{esRetiro ? 'Sin costo' : fmtPrecio(costoEnvio)}</span>
              </div>
              <div className="mob-checkout-total">
                <span>Total</span>
                <span>{fmtPrecio(totalConEnvio)}</span>
              </div>
            </div>
          </>
        )}

        {error && <p className="mob-login-error">{error}</p>}
      </div>

      <div className="mob-action-bar">
        {step < 4 && (
          <div className="mob-action-bar-total">
            <span>{step >= 2 && !esRetiro && zonaSeleccionada ? 'Total con envío' : 'Subtotal'}</span>
            <span>{fmtPrecio(step >= 2 && !esRetiro && zonaSeleccionada ? totalConEnvio : totalCarrito)}</span>
          </div>
        )}
        <button
          type="button"
          className="mob-action-btn"
          style={step === 4 && metodoPago === 'mercadopago' ? { background: '#009ee3' } : undefined}
          onClick={avanzar}
          disabled={enviando}
        >
          {etiquetaBoton}
        </button>
      </div>
    </div>
  )
}
