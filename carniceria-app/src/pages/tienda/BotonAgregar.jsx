import { useEffect, useRef, useState } from 'react'
import { useTiendaToast } from './tiendaToastContext'

const DURACION_AGREGADO_MS = 2000

// Botón "Agregar" de las cards de la tienda (productos y combos) con
// feedback: pasa a "¡Agregado! ✓" en verde 2 segundos y dispara el toast
// "Se añadió X al carrito". Sigue habilitado mientras muestra el estado:
// el cliente puede tocar de nuevo para sumar otra unidad (el tiempo se
// reinicia).
export function BotonAgregar({ nombre, onAgregar }) {
  const [agregado, setAgregado] = useState(false)
  const timerRef = useRef(null)
  const mostrarToast = useTiendaToast()

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function alHacerClic() {
    onAgregar()
    mostrarToast(`Se añadió ${nombre} al carrito`)
    setAgregado(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setAgregado(false), DURACION_AGREGADO_MS)
  }

  return (
    <button
      type="button"
      className={`tienda-btn tienda-btn-agregar${agregado ? ' tienda-btn-agregado' : ''}`}
      onClick={alHacerClic}
      aria-label={agregado ? `${nombre} agregado al carrito` : `Agregar ${nombre} al carrito`}
    >
      {agregado ? '¡Agregado! ✓' : 'Agregar'}
    </button>
  )
}
