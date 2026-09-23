import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { SUCURSAL_ID } from '../../config/sucursal'
import { useAuth } from '../../context/AuthContext'
import { useCarrito } from './CarritoContext'
import { TiendaHeader } from './TiendaHeader'

export function Checkout() {
  const { items, totalCarrito, vaciarCarrito } = useCarrito()
  const { cliente } = useAuth()
  const navigate = useNavigate()

  const [zonas, setZonas] = useState([])
  const [zonaId, setZonaId] = useState('')

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')
  const [metodoPago, setMetodoPago] = useState('mercadopago')
  const [metodoEntrega, setMetodoEntrega] = useState('envio')

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('zonas_envio')
      .select('*')
      .eq('sucursal_id', SUCURSAL_ID)
      .then(({ data, error }) => {
        if (!error) setZonas(data)
      })
  }, [])

  // AuthContext resuelve la sesión de forma asíncrona -- `cliente` puede
  // seguir en null en el primer render aunque haya una sesión de cliente
  // real, y recién pasar a tener datos un instante después. Reaccionar al
  // cambio (en vez de leerlo una sola vez al montar) evita que el
  // formulario quede vacío por ese timing. Sigue siendo editable: esto
  // solo precarga, no vuelve a pisar lo que el usuario ya haya tipeado.
  useEffect(() => {
    if (cliente) {
      setNombre(cliente.nombre ?? '')
      setTelefono(cliente.telefono ?? '')
      setDireccion(cliente.direccion ?? '')
    }
  }, [cliente])

  const esRetiro = metodoEntrega === 'retiro'
  const zonaSeleccionada = zonas.find((z) => z.id === zonaId)
  const costoEnvio = esRetiro ? 0 : zonaSeleccionada ? Number(zonaSeleccionada.costo_envio) : 0
  const totalConEnvio = totalCarrito + costoEnvio

  async function confirmarPedido() {
    setError(null)

    if (!esRetiro && !zonaId) {
      setError('Elegí la zona de envío.')
      return
    }
    if (!nombre.trim() || !telefono.trim()) {
      setError('Completá nombre y teléfono.')
      return
    }
    if (!esRetiro && !direccion.trim()) {
      setError('Completá la dirección de envío.')
      return
    }

    setEnviando(true)

    const { data, error } = await supabase.rpc('crear_pedido_online', {
      p_sucursal_id: SUCURSAL_ID,
      p_zona_envio_id: esRetiro ? null : zonaId,
      p_cliente_nombre: nombre,
      p_cliente_telefono: telefono,
      p_direccion_envio: esRetiro ? null : direccion,
      p_notas: notas,
      p_cliente_web_id: cliente?.id ?? null,
      p_metodo_pago: metodoPago,
      p_metodo_entrega: metodoEntrega,
      p_items: items.map((i) => ({
        producto_id: i.producto_id,
        unidad_venta_id: i.unidad_venta_id,
        cantidad: i.cantidad,
      })),
    })

    setEnviando(false)

    if (error) {
      setError(error.message)
      return
    }

    vaciarCarrito()
    navigate(`/tienda/confirmacion/${data.pedido_id}`)
  }

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
            : 'El pago con Mercado Pago todavía no está conectado. El pedido queda registrado como pendiente de pago y te vamos a contactar para coordinar.'}
        </p>

        <button type="button" className="tienda-btn" onClick={confirmarPedido} disabled={enviando}>
          {enviando ? 'Enviando...' : 'Confirmar pedido'}
        </button>
      </div>
    </>
  )
}
