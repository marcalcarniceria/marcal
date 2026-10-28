import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useCarrito } from './CarritoContext'

const FILAS_POR_PAGINA = 5

// Extraído de MisPedidos.jsx (MisPedidosModal) tal cual estaba -- mismo
// RPC obtener_mis_pedidos + detalle_pedidos + paginación + "repetir
// pedido". Lo usan el modal de compu (MisPedidosModal) y
// MisPedidosMobile, sin duplicar ninguna consulta a Supabase.
//
// `repetirPedido` siempre termina navegando a /tienda/carrito (eso lo
// hacía el modal original también) -- cerrar el modal es una
// responsabilidad del componente que llama, no de este hook.
export function useMisPedidos() {
  const navigate = useNavigate()
  const { agregarItem } = useCarrito()

  const [pedidos, setPedidos] = useState([])
  const [detallePorPedido, setDetallePorPedido] = useState({})
  const [totalFilas, setTotalFilas] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [repitiendoId, setRepitiendoId] = useState(null)

  useEffect(() => {
    async function fetchPedidos() {
      setLoading(true)
      setError(null)

      const { data: pedidosData, error: errorPedidos } = await supabase.rpc('obtener_mis_pedidos', {
        p_limit: FILAS_POR_PAGINA,
        p_offset: pagina * FILAS_POR_PAGINA,
      })

      if (errorPedidos) {
        setError(errorPedidos)
        setLoading(false)
        return
      }

      setPedidos(pedidosData)
      setTotalFilas(pedidosData[0]?.total_pedidos ?? 0)

      const ids = pedidosData.map((p) => p.id)
      if (ids.length === 0) {
        setDetallePorPedido({})
        setLoading(false)
        return
      }

      const { data: detalleData, error: errorDetalle } = await supabase
        .from('detalle_pedidos')
        .select(
          'pedido_id, cantidad, precio_unitario, subtotal, producto_id, unidad_venta_id, combo_id, productos(nombre), combos(nombre), unidades_venta_producto:catalogo_unidades(nombre_unidad)',
        )
        .in('pedido_id', ids)

      if (errorDetalle) {
        setError(errorDetalle)
        setLoading(false)
        return
      }

      const agrupado = {}
      for (const d of detalleData) {
        agrupado[d.pedido_id] = [...(agrupado[d.pedido_id] ?? []), d]
      }
      setDetallePorPedido(agrupado)
      setLoading(false)
    }

    fetchPedidos()
  }, [pagina])

  async function repetirPedido(pedidoId) {
    const lineas = detallePorPedido[pedidoId] ?? []
    if (lineas.length === 0) return

    setRepitiendoId(pedidoId)

    for (const linea of lineas) {
      if (linea.combo_id) {
        agregarItem(
          {
            combo_id: linea.combo_id,
            producto_nombre: linea.combos?.nombre ?? 'Combo',
            unidad_nombre: 'Combo',
            precio_venta: Number(linea.precio_unitario),
          },
          Number(linea.cantidad),
        )
      } else {
        agregarItem(
          {
            producto_id: linea.producto_id,
            producto_nombre: linea.productos?.nombre ?? 'Producto',
            unidad_venta_id: linea.unidad_venta_id,
            unidad_nombre: linea.unidades_venta_producto?.nombre_unidad ?? '',
            precio_venta: Number(linea.precio_unitario),
          },
          Number(linea.cantidad),
        )
      }
    }

    setRepitiendoId(null)
    navigate('/tienda/carrito')
  }

  const haySiguiente = (pagina + 1) * FILAS_POR_PAGINA < totalFilas

  return {
    pedidos,
    detallePorPedido,
    totalFilas,
    pagina,
    setPagina,
    loading,
    error,
    repitiendoId,
    repetirPedido,
    haySiguiente,
    FILAS_POR_PAGINA,
  }
}
