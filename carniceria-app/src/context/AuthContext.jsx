import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [usuario, setUsuario] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function init() {
      const { data } = await supabase.auth.getSession()
      if (!isMounted) return
      setSession(data.session)
      if (data.session) {
        await loadUsuario(data.session.user.id)
      }
      setLoading(false)
    }

    init()

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession)
        if (newSession) {
          await loadUsuario(newSession.user.id)
        } else {
          setUsuario(null)
        }
      },
    )

    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function loadUsuario(userId) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, rol, sucursal_id')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error al cargar datos de usuarios:', error)
      setUsuario(null)
    } else {
      setUsuario(data)
    }
  }

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

  const value = { session, usuario, loading, signIn, signOut }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider')
  }
  return context
}
