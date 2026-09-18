import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [usuario, setUsuario] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)

  // Un mismo login puede ser personal (usuarios) o cliente de la tienda
  // (clientes_web) -- nunca ambos. Se prueba primero usuarios porque esas
  // cuentas son las que importan para el panel protegido.
  async function loadPerfil(authUser) {
    const { data: usuarioData } = await supabase
      .from('usuarios')
      .select('id, nombre, rol, sucursal_id')
      .eq('id', authUser.id)
      .maybeSingle()

    if (usuarioData) {
      setUsuario(usuarioData)
      setCliente(null)
      return
    }

    const { data: clienteData } = await supabase
      .from('clientes_web')
      .select('id, nombre, telefono, direccion, email')
      .eq('id', authUser.id)
      .maybeSingle()

    if (clienteData) {
      setUsuario(null)
      setCliente(clienteData)
      return
    }

    // Todavía no existe en ninguna tabla: si viene de un signUp con
    // confirmación de email pendiente (ver CrearCuenta.jsx), los datos
    // del formulario quedaron guardados en user_metadata porque en ese
    // momento no había sesión real para insertar en clientes_web. Ahora
    // sí hay sesión (auth.uid() válido) -- se termina de crear la fila acá.
    if (authUser.user_metadata?.pendiente_cliente_web) {
      const { data: nuevoCliente, error } = await supabase
        .from('clientes_web')
        .insert({
          id: authUser.id,
          nombre: authUser.user_metadata.nombre ?? '',
          telefono: authUser.user_metadata.telefono ?? null,
          direccion: authUser.user_metadata.direccion ?? null,
          email: authUser.email,
        })
        .select()
        .single()

      if (!error) {
        setUsuario(null)
        setCliente(nuevoCliente)
        return
      }
    }

    setUsuario(null)
    setCliente(null)
  }

  useEffect(() => {
    let isMounted = true

    async function init() {
      const { data } = await supabase.auth.getSession()
      if (!isMounted) return
      setSession(data.session)
      if (data.session) {
        await loadPerfil(data.session.user)
      }
      setLoading(false)
    }

    init()

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession)
        if (newSession) {
          await loadPerfil(newSession.user)
        } else {
          setUsuario(null)
          setCliente(null)
        }
      },
    )

    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const value = { session, usuario, cliente, loading, signIn, signOut }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider')
  }
  return context
}
