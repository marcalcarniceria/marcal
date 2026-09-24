import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { FormCrearCuenta } from './CrearCuenta'

function mensajeError(error) {
  const texto = (error.message ?? '').toLowerCase()
  if (error.code === 'email_not_confirmed' || texto.includes('email not confirmed')) {
    return 'Confirmá tu cuenta desde el mail que te enviamos antes de iniciar sesión.'
  }
  return error.message || 'No se pudo iniciar sesión.'
}

function FormIniciarSesion({ onExito }) {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  async function iniciarSesion(e) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('Completá email y contraseña.')
      return
    }

    setEnviando(true)

    const { data, error: errorSignIn } = await signIn(email.trim(), password)

    if (errorSignIn) {
      setEnviando(false)
      setError(mensajeError(errorSignIn))
      return
    }

    // Se consulta acá (no se espera a que AuthContext termine de resolver
    // su propio estado, que es async) para poder decidir el redirect ya
    // mismo: cualquier usuario autenticado puede leer su propia fila de
    // usuarios (policy "usuarios_select_propio").
    const { data: usuarioData } = await supabase
      .from('usuarios')
      .select('id, rol')
      .eq('id', data.user.id)
      .maybeSingle()

    setEnviando(false)

    if (usuarioData) {
      // Por ahora esta pantalla de inicio distinta es solo para 'dueño' --
      // el resto de los roles sigue entrando a Productos como siempre.
      navigate(usuarioData.rol === 'dueño' ? '/reportes' : '/')
      return
    }

    // No es personal -- es cliente (o AuthContext está por terminar de
    // crear su fila si venía de una confirmación de email pendiente).
    onExito?.()
  }

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
