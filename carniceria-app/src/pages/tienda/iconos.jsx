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

export function IconWhatsApp(props) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" {...props}>
      <path d="M16.02 3C9.4 3 4 8.4 4 15.02c0 2.22.6 4.3 1.63 6.1L4 29l8.06-1.6a11.9 11.9 0 0 0 3.96.68c6.62 0 12.02-5.4 12.02-12.02C28.04 8.4 22.64 3 16.02 3Zm0 21.9c-1.24 0-2.46-.24-3.6-.7l-.26-.1-4.8.95.98-4.67-.17-.27a9.8 9.8 0 0 1-1.5-5.19c0-5.45 4.44-9.9 9.9-9.9 5.45 0 9.9 4.44 9.9 9.9 0 5.45-4.45 9.9-9.9 9.9Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.24-.46-2.37-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.6-.9-2.2-.24-.58-.49-.5-.67-.5-.17 0-.37-.02-.57-.02-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.5s1.07 2.9 1.22 3.1c.15.2 2.1 3.2 5.08 4.5.71.3 1.26.49 1.7.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.4.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  )
}

export function IconInstagram(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconFacebook(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M14 8.5V6.8c0-.8.5-1.3 1.4-1.3H17V2.2C16.4 2.1 15.3 2 14.3 2 11.6 2 10 3.6 10 6.4v2.1H7V12h3v10h4V12h2.7l.5-3.5H14Z" />
    </svg>
  )
}

export function IconChevronAbajo(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m5 9 7 7 7-7" />
    </svg>
  )
}
