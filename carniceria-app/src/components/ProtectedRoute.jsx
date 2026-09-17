import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p>Cargando...</p>

  if (!session) return <Navigate to="/login" state={{ from: location }} replace />

  return children
}
