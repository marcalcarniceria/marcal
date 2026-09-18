import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()

  if (loading) return <p>Cargando...</p>

  // El login del personal ya no vive en una ruta separada (/login) --
  // se hace desde el botón "Iniciar sesión" del header de la tienda
  // (AccesoModal.jsx), así que sin sesión se manda para ahí.
  if (!session) return <Navigate to="/tienda" replace />

  return children
}
