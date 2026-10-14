import { useEffect, useState } from 'react'

const QUERY = '(max-width: 768px)'

// Ancho de pantalla, no tipo de dispositivo -- reacciona a resize y a
// rotación (matchMedia dispara 'change' en ambos casos).
export function useIsMobile() {
  const [esMobile, setEsMobile] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    function onChange(e) {
      setEsMobile(e.matches)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return esMobile
}
