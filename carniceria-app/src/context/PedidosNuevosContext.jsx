import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const PedidosNuevosContext = createContext(undefined)

// Vive dentro de AppLayout (no en main.jsx): solo debe suscribirse
// mientras hay una sesión de staff activa, y se desmonta/limpia solo al
// salir del panel protegido (logout, redirect por ProtectedRoute).
export function PedidosNuevosProvider({ children }) {
  const [cantidadNuevos, setCantidadNuevos] = useState(0)

  useEffect(() => {
    const canal = supabase
      .channel('pedidos-online-nuevos')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos_online' },
        (payload) => {
          // Temporal, para diagnosticar el bug de Realtime.
          console.log('[pedidos-online-nuevos] INSERT recibido', payload)
          setCantidadNuevos((cantidad) => cantidad + 1)
        },
      )
      .subscribe((status, err) => {
        // Temporal, para diagnosticar el bug de Realtime.
        console.log('[pedidos-online-nuevos] estado del canal:', status, err ?? '')
      })

    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  function resetear() {
    setCantidadNuevos(0)
  }

  const value = { cantidadNuevos, resetear }

  return <PedidosNuevosContext.Provider value={value}>{children}</PedidosNuevosContext.Provider>
}

export function usePedidosNuevos() {
  const context = useContext(PedidosNuevosContext)
  if (context === undefined) {
    throw new Error('usePedidosNuevos debe usarse dentro de un PedidosNuevosProvider')
  }
  return context
}
