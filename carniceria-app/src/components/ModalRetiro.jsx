import { useState } from 'react'
import { supabase } from '../supabaseClient'

// Retiro de efectivo / sangría: pasar plata de la gaveta a la caja fuerte.
// No es un gasto -> RPC registrar_retiro_caja (schema_retiros_caja.sql),
// tabla propia. Se descuenta del esperado en caja del cierre.
export function ModalRetiro({ abierto, onCerrar, onRegistrado }) {
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  function cerrar() {
    if (enviando) return
    setMonto('')
    setMotivo('')
    setError(null)
    onCerrar()
  }

  async function confirmar() {
    setError(null)
    const valor = Number(monto)
    if (!(valor > 0)) return setError('Ingresá un monto mayor a cero.')

    setEnviando(true)
    const { error } = await supabase.rpc('registrar_retiro_caja', {
      p_monto: valor,
      p_motivo: motivo.trim() || null,
    })
    setEnviando(false)

    if (error) return setError(error.message)

    const texto = `Retiro de $${valor.toFixed(2)} registrado. Se descuenta del efectivo esperado en caja.`
    cerrar()
    onRegistrado(texto)
  }

  if (!abierto) return null

  return (
    <div className="staff-modal-overlay" onClick={cerrar}>
      <div
        className="staff-modal-grande"
        style={{ maxWidth: 420 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-retiro-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="staff-modal-header">
          <h2 id="modal-retiro-titulo" style={{ margin: 0 }}>
            Retiro de efectivo / Sangría
          </h2>
        </div>

        <div className="staff-modal-cuerpo" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1rem 1.25rem' }}>
          <p className="staff-modal-nota" style={{ margin: 0 }}>
            Para pasar efectivo de la gaveta a la caja fuerte. No cuenta como gasto: solo baja el efectivo que el
            sistema espera encontrar al cerrar la caja.
          </p>
          <label className="staff-campo">
            Monto a retirar ($)
            <input
              type="number"
              min="0"
              step="100"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              autoFocus
              disabled={enviando}
            />
          </label>
          <label className="staff-campo">
            Nota / motivo (opcional)
            <input
              type="text"
              maxLength={200}
              placeholder="Ej: Retiro turno mañana"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={enviando}
            />
          </label>
        </div>

        <div className="staff-modal-pie">
          {error && <p className="staff-mensaje-error" style={{ margin: 0, marginRight: 'auto' }}>{error}</p>}
          <button type="button" className="staff-btn staff-btn-secundario" onClick={cerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="staff-btn" onClick={confirmar} disabled={enviando}>
            {enviando ? 'Registrando...' : 'Registrar retiro'}
          </button>
        </div>
      </div>
    </div>
  )
}
