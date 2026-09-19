import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const PedidosStockInsuficienteContext = createContext(undefined)

// Mismo patrón que PedidosNuevosContext.jsx, pero es una alerta de
// naturaleza distinta (no se mezclan en el mismo contador): esta
// escucha líneas de detalle_pedidos con stock_insuficiente = true, no
// pedidos nuevos en general.
//
// Se cuenta por PEDIDO, no por línea: si un mismo pedido tiene 2 o más
// productos con falta de stock, eso son 2+ eventos INSERT en
// detalle_pedidos pero un solo pedido para el cajero, así que se
// deduplica por pedido_id en un Set en vez de sumar 1 por evento.
export function PedidosStockInsuficienteProvider({ children }) {
  const [pedidosConProblema, setPedidosConProblema] = useState(new Set())

  useEffect(() => {
    const canal = supabase
      .channel('pedidos-stock-insuficiente')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'detalle_pedidos',
          filter: 'stock_insuficiente=eq.true',
        },
        (payload) => {
          console.log('[pedidos-stock-insuficiente] INSERT recibido', payload)
          setPedidosConProblema((actual) => {
            const siguiente = new Set(actual)
            siguiente.add(payload.new.pedido_id)
            return siguiente
          })
        },
      )
      .subscribe((status, err) => {
        console.log('[pedidos-stock-insuficiente] estado del canal:', status, err ?? '')
      })

    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  function resetear() {
    setPedidosConProblema(new Set())
  }

  const value = { cantidadNuevos: pedidosConProblema.size, resetear }

  return (
    <PedidosStockInsuficienteContext.Provider value={value}>
      {children}
    </PedidosStockInsuficienteContext.Provider>
  )
}

export function usePedidosStockInsuficiente() {
  const context = useContext(PedidosStockInsuficienteContext)
  if (context === undefined) {
    throw new Error('usePedidosStockInsuficiente debe usarse dentro de un PedidosStockInsuficienteProvider')
  }
  return context
}
