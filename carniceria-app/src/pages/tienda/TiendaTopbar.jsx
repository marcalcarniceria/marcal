import { FACEBOOK_URL, INSTAGRAM_URL } from '../../config/sucursal'
import { IconFacebook } from './iconos'

// Barra fina verde de redes, arriba del navbar (compu y mobile).
export function TiendaTopbar() {
  return (
    <div className="tienda-topbar">
      <span>Seguinos</span>
      <div className="tienda-topbar-redes">
        <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label="Instagram">
          <img src="/images/insta.png" alt="" className="tienda-instagram-logo" />
        </a>
        {FACEBOOK_URL && (
          <a href={FACEBOOK_URL} target="_blank" rel="noreferrer" aria-label="Facebook">
            <IconFacebook width={15} height={15} aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  )
}
