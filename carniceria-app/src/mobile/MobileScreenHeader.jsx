import { useNavigate } from 'react-router-dom'

// Header chico compartido por las pantallas que no son el catálogo
// (detalle de producto, carrito, checkout, mis pedidos, login): flecha
// de volver + título. `onBack` es opcional -- por defecto usa el botón
// "atrás" del navegador.
export function MobileScreenHeader({ titulo, onBack }) {
  const navigate = useNavigate()

  return (
    <div className="mob-screen-header">
      <button
        type="button"
        className="mob-back-btn"
        onClick={onBack ?? (() => navigate(-1))}
        aria-label="Volver"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      {titulo && <div className="mob-titulo">{titulo}</div>}
    </div>
  )
}
