import { useState } from 'react'
import { useLoginForm } from './useLoginForm'
import { FormCrearCuenta } from './CrearCuenta'

function FormIniciarSesion({ onExito }) {
  const { email, setEmail, password, setPassword, enviando, error, iniciarSesion } = useLoginForm(onExito)

  return (
    <form className="tienda-form" onSubmit={iniciarSesion}>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>

      <label>
        Contraseña
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>

      {error && <p className="tienda-error">{error}</p>}

      <button type="submit" className="tienda-btn" disabled={enviando}>
        {enviando ? 'Ingresando...' : 'Ingresar'}
      </button>
    </form>
  )
}

export function AccesoModal({ onClose }) {
  const [tab, setTab] = useState('login')

  return (
    <div className="tienda-modal-overlay" onClick={onClose}>
      <div className="tienda-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tienda-modal-cerrar" onClick={onClose} aria-label="Cerrar">
          ×
        </button>

        <div className="tienda-modal-tabs">
          <button
            type="button"
            className={`tienda-modal-tab${tab === 'login' ? ' activo' : ''}`}
            onClick={() => setTab('login')}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            className={`tienda-modal-tab${tab === 'crear' ? ' activo' : ''}`}
            onClick={() => setTab('crear')}
          >
            Crear cuenta
          </button>
        </div>

        {tab === 'login' && <FormIniciarSesion onExito={onClose} />}
        {tab === 'crear' && <FormCrearCuenta onExito={onClose} />}
      </div>
    </div>
  )
}
