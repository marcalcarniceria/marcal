import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TiendaToastContext } from './tiendaToastContext'

const DURACION_MS = 3000

// Toast flotante de la tienda (compu). Un solo toast a la vez: si el
// cliente agrega varios productos seguidos, se reemplaza el texto y se
// reinicia el tiempo, en vez de apilar notificaciones.
export function TiendaToastProvider({ children, habilitado = true }) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  const mostrarToast = useCallback((texto) => {
    clearTimeout(timerRef.current)
    // id nuevo en cada aviso: reinicia la animación de entrada aunque el
    // texto sea el mismo (mismo producto agregado dos veces).
    setToast({ texto, id: Date.now() })
    timerRef.current = setTimeout(() => setToast(null), DURACION_MS)
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return (
    <TiendaToastContext.Provider value={habilitado ? mostrarToast : null}>
      {children}
      {/* aria-live siempre montado: los lectores de pantalla anuncian el
          texto cuando cambia. */}
      <div className="tienda-toast-zona" aria-live="polite" role="status">
        {toast && (
          <div key={toast.id} className="tienda-toast">
            <span className="tienda-toast-icono" aria-hidden="true">
              ✓
            </span>
            <span className="tienda-toast-texto">{toast.texto}</span>
            <Link to="/tienda/carrito" className="tienda-toast-link" onClick={() => setToast(null)}>
              Ver carrito
            </Link>
          </div>
        )}
      </div>
    </TiendaToastContext.Provider>
  )
}
