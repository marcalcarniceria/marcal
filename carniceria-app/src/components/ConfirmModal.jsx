import { useEffect } from 'react'

// Modal de confirmación genérico para acciones destructivas (eliminar,
// cancelar, etc.) -- reemplaza window.confirm en todo el panel.
export function ConfirmModal({
  abierto,
  titulo = '¿Estás seguro?',
  mensaje = 'Esta acción no se puede deshacer.',
  textoConfirmar = 'Eliminar',
  textoCancelar = 'Cancelar',
  procesando = false,
  onConfirmar,
  onCancelar,
}) {
  useEffect(() => {
    if (!abierto) return
    function alPresionarTecla(e) {
      if (e.key === 'Escape') onCancelar?.()
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [abierto, onCancelar])

  if (!abierto) return null

  return (
    <div className="staff-confirm-overlay" onClick={() => !procesando && onCancelar?.()}>
      <div
        className="staff-confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="staff-confirm-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="staff-confirm-titulo" className="staff-confirm-titulo">
          {titulo}
        </h2>
        <p className="staff-confirm-mensaje">{mensaje}</p>
        <div className="staff-confirm-acciones">
          <button type="button" className="staff-btn staff-btn-secundario" onClick={onCancelar} disabled={procesando}>
            {textoCancelar}
          </button>
          <button type="button" className="staff-btn staff-btn-egreso" onClick={onConfirmar} disabled={procesando}>
            {procesando ? 'Procesando...' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
