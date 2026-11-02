import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useCarrito } from './CarritoContext'
import { AccesoModal } from './AccesoModal'
import { MisPedidosModal } from './MisPedidos'
import { FACEBOOK_URL, INSTAGRAM_URL } from '../../config/sucursal'
import { IconFacebook, IconUsuario } from './iconos'

const SCROLL_COMPACTO = 50

export function TiendaHeader() {
  const { cantidadTotal } = useCarrito()
  const { cliente, loading, signOut } = useAuth()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [misPedidosAbierto, setMisPedidosAbierto] = useState(false)
  // Puramente visual: solo controla si el <nav> se ve desplegado en
  // mobile (no existía menú hamburguesa hasta ahora). No reemplaza ni
  // toca menuAbierto (el dropdown de cuenta), que sigue igual.
  const [menuMobileAbierto, setMenuMobileAbierto] = useState(false)
  const cuentaRef = useRef(null)
  const [compacto, setCompacto] = useState(() => window.scrollY > SCROLL_COMPACTO)

  useEffect(() => {
    function alScrollear() {
      setCompacto(window.scrollY > SCROLL_COMPACTO)
    }

    window.addEventListener('scroll', alScrollear, { passive: true })
    return () => window.removeEventListener('scroll', alScrollear)
  }, [])

  // Cerrar el dropdown al clickear afuera (comportamiento estándar de
  // cualquier menú desplegable).
  useEffect(() => {
    if (!menuAbierto) return

    function alClickFuera(e) {
      if (cuentaRef.current && !cuentaRef.current.contains(e.target)) {
        setMenuAbierto(false)
      }
    }

    document.addEventListener('mousedown', alClickFuera)
    return () => document.removeEventListener('mousedown', alClickFuera)
  }, [menuAbierto])

  function clickCuenta() {
    if (cliente) {
      setMenuAbierto((abierto) => !abierto)
    } else {
      setModalAbierto(true)
      setMenuMobileAbierto(false)
    }
  }

  function abrirMisPedidos() {
    setMenuAbierto(false)
    setMenuMobileAbierto(false)
    setMisPedidosAbierto(true)
  }

  function cerrarSesion() {
    setMenuAbierto(false)
    setMenuMobileAbierto(false)
    signOut()
  }

  return (
    <>
      {/* El header es fixed: este espacio tiene siempre la misma altura, así
          achicar el navbar no mueve la página (si la moviera, el scroll podría
          volver a cruzar el umbral de 50px y el header parpadearía). */}
      <div className="tienda-header-espacio" aria-hidden="true" />

      <header className={`tienda-header${compacto ? ' tienda-header-compacto' : ''}`}>
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

        <div className="tienda-navbar">
          <Link to="/tienda" className="tienda-logo">
            <img src="/images/logo-marcal.png" alt="Mar-Cal" className="tienda-logo-img" />
            <span className="tienda-logo-texto">
              <small>Carnicería y Verdulería</small>
            </span>
          </Link>

          {/* Solo visible en mobile (CSS) -- despliega el mismo <nav> de
              siempre, no cambia qué opciones hay adentro. */}
          <button
            type="button"
            className="tienda-menu-toggle"
            onClick={() => setMenuMobileAbierto((abierto) => !abierto)}
            aria-label={menuMobileAbierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuMobileAbierto}
          >
            <span />
            <span />
            <span />
          </button>

          <nav className={menuMobileAbierto ? 'abierto' : ''}>
            {!loading && (
              <div className="tienda-cuenta" ref={cuentaRef}>
                <button type="button" className="tienda-cuenta-btn" onClick={clickCuenta}>
                  <IconUsuario width={18} height={18} />
                  {cliente ? cliente.nombre : 'Iniciar sesión'}
                </button>

                {menuAbierto && (
                  <div className="tienda-cuenta-menu">
                    <button type="button" className="tienda-cuenta-menu-item" onClick={abrirMisPedidos}>
                      Mis pedidos
                    </button>
                    <button type="button" className="tienda-cuenta-menu-item" onClick={cerrarSesion}>
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            )}
            <Link
              to="/tienda/carrito"
              className="tienda-carrito-link"
              data-cantidad={cantidadTotal}
              onClick={() => setMenuMobileAbierto(false)}
            >
              Carrito ({cantidadTotal})
            </Link>
          </nav>
        </div>

        {modalAbierto && <AccesoModal onClose={() => setModalAbierto(false)} />}
        {misPedidosAbierto && cliente && (
          <MisPedidosModal clienteId={cliente.id} onClose={() => setMisPedidosAbierto(false)} />
        )}
      </header>
    </>
  )
}
