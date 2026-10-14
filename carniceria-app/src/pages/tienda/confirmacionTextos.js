// ?pago= lo agregan las back_urls de crear-preferencia-mp (aprobado /
// pendiente / rechazado) y Checkout.jsx cuando no se pudo abrir Mercado
// Pago (error). Es SOLO feedback para el cliente: quien marca el pedido
// como cobrado es webhook-mp, nunca esta página (la URL se puede tipear
// a mano). Compartido entre Confirmacion.jsx (compu) y ConfirmacionMobile.
export const AVISOS_PAGO = {
  aprobado: {
    clase: 'exito',
    titulo: '¡Pago confirmado!',
    texto: 'Ya estamos preparando tu pedido.',
  },
  pendiente: {
    clase: 'pendiente',
    titulo: 'Tu pago se está procesando.',
    texto: 'Te avisaremos apenas se acredite. No hace falta que pagues de nuevo.',
  },
  rechazado: {
    clase: 'error',
    titulo: 'El pago no se pudo completar.',
    texto: 'Tu pedido quedó registrado pero todavía no está pagado. Podés intentar de nuevo o escribirnos.',
  },
  error: {
    clase: 'error',
    titulo: 'No pudimos abrir Mercado Pago.',
    texto: 'Tu pedido quedó registrado pero todavía no está pagado. Podés intentar de nuevo o escribirnos.',
  },
}
