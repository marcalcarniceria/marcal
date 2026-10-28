import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// `rolRequerido` es opcional (no lo usa ninguna ruta existente, así que
// no les cambia nada) -- lo usa /usuarios para que una URL directa de
// alguien que no es dueño redirija en vez de solo confiar en que el
// link esté escondido del sidebar.
export function ProtectedRoute({ children, rolRequerido }) {
  const { session, usuario, loading, perfilListo } = useAuth()

  // perfilListo: justo después del login la sesión ya existe pero el
  // perfil todavía se está cargando -- sin esto, un empleado recién
  // logueado rebotaba a la tienda por un instante de `usuario` null.
  if (loading || !perfilListo) return <p>Cargando...</p>

  // El login del personal ya no vive en una ruta separada (/login) --
  // se hace desde el botón "Iniciar sesión" del header de la tienda
  // (AccesoModal.jsx), así que sin sesión se manda para ahí.
  if (!session) return <Navigate to="/tienda" replace />

  // Sesión no alcanza: un cliente de la tienda también tiene sesión. Solo
  // entra al panel quien tiene fila en `usuarios` (el personal). Es una
  // barrera de UX -- la real son la RLS y los chequeos de rol en la base.
  if (!usuario) return <Navigate to="/tienda" replace />

  if (rolRequerido && usuario?.rol !== rolRequerido) return <Navigate to="/" replace />

  return children
}
