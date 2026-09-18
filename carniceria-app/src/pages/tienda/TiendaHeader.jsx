import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useCarrito } from './CarritoContext'
import { AccesoModal } from './AccesoModal'
import { MisPedidosModal } from './MisPedidos'
import { IconUsuario } from './iconos'

export function TiendaHeader() {
  const { cantidadTotal } = useCarrito()
  const { cliente, loading, signOut } = useAuth()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [misPedidosAbierto, setMisPedidosAbierto] = useState(false)
  const cuentaRef = useRef(null)

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
    }
  }

  function abrirMisPedidos() {
    setMenuAbierto(false)
    setMisPedidosAbierto(true)
  }

  function cerrarSesion() {
    setMenuAbierto(false)
    signOut()
  }

  return (
    <header className="tienda-header">
      <Link to="/tienda" className="tienda-logo">
        <span className="tienda-logo-marca">M</span>
        <span className="tienda-logo-texto">
          Mar-Cal
          <small>Carnicería y Verdulería</small>
        </span>
      </Link>
      <nav>
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
        <Link to="/tienda/carrito" className="tienda-carrito-link" data-cantidad={cantidadTotal}>
          Carrito ({cantidadTotal})
        </Link>
      </nav>

      {modalAbierto && <AccesoModal onClose={() => setModalAbierto(false)} />}
      {misPedidosAbierto && cliente && (
        <MisPedidosModal clienteId={cliente.id} onClose={() => setMisPedidosAbierto(false)} />
      )}
    </header>
  )
}
