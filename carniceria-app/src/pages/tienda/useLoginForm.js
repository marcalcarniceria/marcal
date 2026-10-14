import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'

function mensajeError(error) {
  const texto = (error.message ?? '').toLowerCase()
  if (error.code === 'email_not_confirmed' || texto.includes('email not confirmed')) {
    return 'Confirmá tu cuenta desde el mail que te enviamos antes de iniciar sesión.'
  }
  return error.message || 'No se pudo iniciar sesión.'
}

// Extraído de AccesoModal.jsx (FormIniciarSesion) tal cual estaba --
// `onClienteLogueado` reemplaza al `onExito` original (mismo momento en
// que se llama, mismo caso: login de un cliente, no de personal).
export function useLoginForm(onClienteLogueado) {
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
    onClienteLogueado?.()
  }

  return { email, setEmail, password, setPassword, enviando, error, iniciarSesion }
}
