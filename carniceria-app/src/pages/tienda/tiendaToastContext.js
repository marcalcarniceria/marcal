import { createContext, useContext } from 'react'

// Contexto del toast "Se añadió X al carrito" de la tienda de COMPU.
// Separado de TiendaToast.jsx (el provider) para que Fast Refresh siga
// funcionando: un archivo de componente no debería exportar hooks.
// La versión mobile tiene su propio toast (CatalogoMobile) y no lo usa.
export const TiendaToastContext = createContext(null)

// Devuelve mostrarToast(texto). Fuera del provider es un no-op, así un
// componente compartido nunca rompe por no tener toast.
export function useTiendaToast() {
  return useContext(TiendaToastContext) ?? (() => {})
}
