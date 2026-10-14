import { useState } from 'react'
import { supabase } from '../../supabaseClient'

// Extraído de Confirmacion.jsx tal cual estaba -- mismo reintento de
// Mercado Pago para un pedido que ya existe, sin ningún cambio. Lo usan
// tanto Confirmacion.jsx (compu) como ConfirmacionMobile.
export function useConfirmacionPago(pedidoId) {
  const [reintentando, setReintentando] = useState(false)
  const [errorReintento, setErrorReintento] = useState(null)

  // El pedido ya existe y sigue pendiente de pago: se pide una preferencia
  // nueva para el MISMO pedido (no hace falta el carrito, que ya se vació).
  // crear-preferencia-mp rechaza el reintento si mientras tanto se cobró.
  async function reintentarPago() {
    setErrorReintento(null)
    setReintentando(true)

    const { data, error } = await supabase.functions.invoke('crear-preferencia-mp', {
      body: { pedido_id: pedidoId },
    })

    if (error || !data?.ok || !data.init_point) {
      setReintentando(false)
      setErrorReintento(data?.error ?? 'No pudimos abrir Mercado Pago. Escribinos por WhatsApp y lo resolvemos.')
      return
    }

    window.location.href = data.init_point
  }

  return { reintentando, errorReintento, reintentarPago }
}
