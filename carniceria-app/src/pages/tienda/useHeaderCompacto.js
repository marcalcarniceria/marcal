import { useEffect, useState } from 'react'

const SCROLL_COMPACTO = 50

// true cuando se bajó lo suficiente como para achicar el header. Lo comparten
// el header de compu (TiendaHeader) y el de mobile (CatalogoMobile).
export function useHeaderCompacto() {
  const [compacto, setCompacto] = useState(() => window.scrollY > SCROLL_COMPACTO)

  useEffect(() => {
    function alScrollear() {
      setCompacto(window.scrollY > SCROLL_COMPACTO)
    }

    window.addEventListener('scroll', alScrollear, { passive: true })
    return () => window.removeEventListener('scroll', alScrollear)
  }, [])

  return compacto
}
