import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { TiendaHeader } from './TiendaHeader'

// Formulario reutilizable: lo usa esta página completa Y la pestaña
// "Crear cuenta" del modal de acceso (AccesoModal.jsx) -- una sola
// definición, dos lugares que la muestran.
//
// No inserta en clientes_web acá: eso ahora lo hace AuthContext de forma
// centralizada (loadPerfil), apenas detecta una sesión real sin fila
// todavía. Insertarlo también acá generaría una carrera con
// onAuthStateChange (ambos intentando crear la misma fila a la vez).
export function FormCrearCuenta({ onExito }) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [mensaje, setMensaje] = useState(null)

  async function crearCuenta(e) {
    e.preventDefault()
    setError(null)
    setMensaje(null)

    if (!nombre.trim() || !telefono.trim() || !direccion.trim() || !email.trim() || !password) {
      setError('Completá todos los campos.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña tiene que tener al menos 6 caracteres.')
      return
    }

    setEnviando(true)

    // La info del formulario también queda en user_metadata: si el
    // proyecto tiene confirmación de email activada, signUp() no
    // devuelve sesión todavía -- AuthContext termina de crear la fila
    // en clientes_web con estos datos recién en el primer login real.
    const { data, error: errorSignUp } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          direccion: direccion.trim(),
          pendiente_cliente_web: true,
        },
      },
    })

    setEnviando(false)

    if (errorSignUp) {
      setError(errorSignUp.message)
      return
    }

    if (data.session) {
      // Confirmación de email desactivada: ya quedó logueado (AuthContext
      // va a crear la fila de clientes_web solo).
      setMensaje({ tipo: 'exito', texto: `¡Listo, ${nombre.trim()}! Ya podés hacer tu pedido.` })
      onExito?.()
    } else {
      setMensaje({
        tipo: 'exito',
        texto: 'Te mandamos un correo para confirmar tu cuenta. Después de confirmarlo, iniciá sesión para terminar de crear tu perfil.',
      })
    }
  }

  return (
    <form className="tienda-form" onSubmit={crearCuenta}>
      <label>
        Nombre y apellido
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>

      <label>
        Teléfono
        <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </label>

      <label>
        Dirección
        <input type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
      </label>

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
          autoComplete="new-password"
        />
      </label>

      {error && <p className="tienda-error">{error}</p>}
      {mensaje && <p className="tienda-mensaje-exito">{mensaje.texto}</p>}

      <button type="submit" className="tienda-btn" disabled={enviando}>
        {enviando ? 'Creando cuenta...' : 'Crear cuenta'}
      </button>
    </form>
  )
}

export function CrearCuenta() {
  return (
    <>
      <TiendaHeader />
      <div className="tienda-contenido" style={{ maxWidth: 480 }}>
        <h1>Crear cuenta</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Solo para clientes. Si comprás como invitado no hace falta crear cuenta.
        </p>

        <FormCrearCuenta />

        <p style={{ marginTop: '1rem' }}>
          <Link to="/tienda" className="tienda-volver">
            ← Volver a la tienda
          </Link>
        </p>
      </div>
    </>
  )
}
