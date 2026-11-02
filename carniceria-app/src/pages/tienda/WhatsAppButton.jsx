import { WHATSAPP_LOCAL } from '../../config/sucursal'
import { linkWhatsApp } from '../../lib/whatsapp'
import { IconWhatsApp } from './iconos'

const WHATSAPP_URL = linkWhatsApp(WHATSAPP_LOCAL, 'Hola, quiero hacer un pedido')

export function WhatsAppButton() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noreferrer"
      className="tienda-whatsapp-btn"
      aria-label="Pedir por WhatsApp"
    >
      <IconWhatsApp width="26" height="26" aria-hidden="true" />
    </a>
  )
}
