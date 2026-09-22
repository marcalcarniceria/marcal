export function IconCarne(props) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 44c-6-4-9-11-6-18 3-8 12-14 21-13 8 1 14 8 13 16-1 7-7 12-14 13-3 6-9 10-16 9-4-1-6-4-5-7 1-2 4-2 7 0Z" />
      <circle cx="41" cy="20" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="34" cy="16" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconVerdura(props) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M32 14c9 0 16 8 16 19 0 10-7 18-16 18s-16-8-16-18c0-11 7-19 16-19Z" />
      <path d="M32 14c0-6 4-10 9-11" />
      <path d="M32 14c0-6-4-10-9-11" />
      <path d="M22 30c4-2 16-2 20 0" opacity="0.6" />
    </svg>
  )
}

export function IconBalanza(props) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M32 10v40" />
      <path d="M14 18h36" />
      <path d="M24 44h16" />
      <path d="M14 18 8 30a6 6 0 0 0 12 0Z" />
      <path d="M50 18l-6 12a6 6 0 0 0 12 0Z" />
    </svg>
  )
}

export function IconCamion(props) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="6" y="22" width="30" height="18" rx="2" />
      <path d="M36 27h11l9 9v4h-20z" />
      <circle cx="18" cy="44" r="4" />
      <circle cx="46" cy="44" r="4" />
    </svg>
  )
}

export function IconUsuario(props) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="32" cy="22" r="10" />
      <path d="M12 54c2-12 10-18 20-18s18 6 20 18" />
    </svg>
  )
}

export function IconEtiqueta(props) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 10h22l26 26-18 18L12 28Z" />
      <circle cx="22" cy="22" r="3" />
    </svg>
  )
}

export function IconCaja(props) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 22 32 10l24 12v22L32 56 8 44Z" />
      <path d="M8 22l24 12 24-12" />
      <path d="M32 34v22" />
    </svg>
  )
}

export function IconGrilla(props) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="10" y="10" width="18" height="18" rx="3" />
      <rect x="36" y="10" width="18" height="18" rx="3" />
      <rect x="10" y="36" width="18" height="18" rx="3" />
      <rect x="36" y="36" width="18" height="18" rx="3" />
    </svg>
  )
}

export function IconCalendario(props) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="8" y="14" width="48" height="42" rx="5" />
      <path d="M8 26h48" />
      <path d="M20 8v12" />
      <path d="M44 8v12" />
      <circle cx="32" cy="41" r="7" />
      <path d="M32 37v4l3 2" />
    </svg>
  )
}

export function IconEstrella(props) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M32 8l7.4 15.1 16.6 2.4-12 11.7 2.8 16.5L32 45.9 17.2 53.7 20 37.2 8 25.5l16.6-2.4Z" />
    </svg>
  )
}

// Ícono de envío pensado junto con IconCalendario / IconEstrella / IconLocal
// (misma grilla de 64, mismo peso visual): las ruedas cortan la línea de la
// carrocería en vez de superponerse.
export function IconEnvio(props) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M11 44H6V16h32v28" />
      <path d="M21 44h20" />
      <path d="M38 26h10l10 10v8h-5" />
      <circle cx="16" cy="48" r="5" />
      <circle cx="48" cy="48" r="5" />
    </svg>
  )
}

export function IconLocal(props) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 10h40l5 15a7.5 7.5 0 0 1-13.3 4.5 7.5 7.5 0 0 1-11.4 0A7.5 7.5 0 0 1 20.3 29.5 7.5 7.5 0 0 1 7 25Z" />
      <path d="M11 35v19h42V35" />
      <path d="M26 54V42h12v12" />
    </svg>
  )
}
