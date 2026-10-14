import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { SUCURSAL_ID } from '../../config/sucursal'
import { useAuth } from '../../context/AuthContext'
import { useCarrito } from './CarritoContext'

// Extraído de Checkout.jsx tal cual estaba -- mismo flujo de
// crear_pedido_online + crear-preferencia-mp, sin ningún cambio. Lo usan
// tanto el Checkout de compu como CheckoutMobile, para que el camino de
// Mercado Pago (que es el que mueve plata real) nunca quede duplicado.
export function useCheckout() {
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
      // Combos van con combo_id; productos con producto_id + unidad_venta_id
      // (ver crear_pedido_online en schema_combos_ventas.sql).
      p_items: items.map((i) =>
        i.combo_id
          ? { combo_id: i.combo_id, cantidad: i.cantidad }
          : { producto_id: i.producto_id, unidad_venta_id: i.unidad_venta_id, cantidad: i.cantidad },
      ),
    })

    if (error) {
      setEnviando(false)
      setError(error.message)
      return
    }

    if (metodoPago !== 'mercadopago') {
      setEnviando(false)
      vaciarCarrito()
      navigate(`/tienda/confirmacion/${data.pedido_id}`)
      return
    }

    // Mercado Pago: el pedido ya quedó registrado como pendiente_pago. La
    // Edge Function arma la preferencia leyendo el pedido desde la base
    // (los precios NO salen del carrito del navegador); `items` va solo
    // como referencia.
    const { data: preferencia, error: errorPreferencia } = await supabase.functions.invoke(
      'crear-preferencia-mp',
      {
        body: {
          pedido_id: data.pedido_id,
          items: items.map((i) => ({
            producto_id: i.producto_id ?? null,
            combo_id: i.combo_id ?? null,
            cantidad: i.cantidad,
          })),
        },
      },
    )

    // El pedido ya existe: se vacía el carrito igual, para que un reintento
    // no genere un pedido duplicado.
    vaciarCarrito()

    if (errorPreferencia || !preferencia?.ok || !preferencia.init_point) {
      // No se pudo abrir el pago, pero el pedido está registrado -- se
      // muestra la confirmación y el local coordina el cobro.
      console.error(errorPreferencia ?? preferencia?.error)
      setEnviando(false)
      navigate(`/tienda/confirmacion/${data.pedido_id}?pago=error`)
      return
    }

    // Redirección completa (no navigate): Checkout Pro es un sitio externo.
    window.location.href = preferencia.init_point
  }

  return {
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
    metodoEntrega,
    setMetodoEntrega,
    enviando,
    error,
    esRetiro,
    costoEnvio,
    totalConEnvio,
    confirmarPedido,
  }
}
