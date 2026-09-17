import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { SUCURSAL_ID } from '../../config/sucursal'
import { useCarrito } from './CarritoContext'
import { TiendaHeader } from './TiendaHeader'

export function Checkout() {
  const { items, totalCarrito, vaciarCarrito } = useCarrito()
  const navigate = useNavigate()

  const [zonas, setZonas] = useState([])
  const [zonaId, setZonaId] = useState('')

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')

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

  const zonaSeleccionada = zonas.find((z) => z.id === zonaId)
  const costoEnvio = zonaSeleccionada ? Number(zonaSeleccionada.costo_envio) : 0
  const totalConEnvio = totalCarrito + costoEnvio

  async function confirmarPedido() {
    setError(null)

    if (!zonaId) {
      setError('Elegí la zona de envío.')
      return
    }
    if (!nombre.trim() || !telefono.trim() || !direccion.trim()) {
      setError('Completá nombre, teléfono y dirección.')
      return
    }

    setEnviando(true)

    const { data, error } = await supabase.rpc('crear_pedido_online', {
      p_sucursal_id: SUCURSAL_ID,
      p_zona_envio_id: zonaId,
      p_cliente_nombre: nombre,
      p_cliente_telefono: telefono,
      p_direccion_envio: direccion,
      p_notas: notas,
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

        <div className="tienda-form">
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

          <label>
            Nombre y apellido
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>

          <label>
            Teléfono
            <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>

          <label>
            Dirección de envío
            <input type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </label>

          <label>
            Notas (opcional)
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
          </label>
        </div>

        <div className="tienda-resumen">
          <p>
            <span>Productos</span>
            <span>${totalCarrito.toFixed(2)}</span>
          </p>
          <p>
            <span>Envío</span>
            <span>${costoEnvio.toFixed(2)}</span>
          </p>
          <p className="tienda-total-row">
            <span>Total</span>
            <span>${totalConEnvio.toFixed(2)}</span>
          </p>
        </div>

        {error && <p className="tienda-error">{error}</p>}

        <p className="tienda-aviso">
          El pago con Mercado Pago todavía no está conectado. El pedido queda registrado como
          pendiente de pago y te vamos a contactar para coordinar.
        </p>

        <button type="button" className="tienda-btn" onClick={confirmarPedido} disabled={enviando}>
          {enviando ? 'Enviando...' : 'Confirmar pedido'}
        </button>
      </div>
    </>
  )
}
