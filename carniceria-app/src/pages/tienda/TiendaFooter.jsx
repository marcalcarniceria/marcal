export function TiendaFooter() {
  return (
    <footer className="tienda-footer">
      <div className="tienda-footer-inner">
        <div className="tienda-footer-marca">
          <span className="tienda-logo-marca">M</span>
          <div>
            <strong>Mar-Cal</strong>
            <p>Carne, frutas y verduras de calidad. Todo de primera calidad.</p>
          </div>
        </div>

        <div className="tienda-footer-datos">
          <p>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 21s-7-6.1-7-11a7 7 0 1 1 14 0c0 4.9-7 11-7 11Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            Arenales 345, Barrio Juniors
          </p>
          <p>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M4 4h16v16H4z" opacity="0" />
              <path d="M20.5 17.3c0 .4-.1.8-.3 1.1-.2.4-.5.7-.9.9-.5.3-1.1.4-1.7.3-2.6-.5-5-1.9-6.9-3.8-1.9-1.9-3.3-4.3-3.8-6.9-.1-.6 0-1.2.3-1.7.2-.4.5-.7.9-.9.3-.2.7-.3 1.1-.3h1.6c.5 0 1 .3 1.1.8l.7 2.1c.1.4 0 .8-.3 1.1l-.8.8c.6 1.4 1.7 2.5 3.1 3.1l.8-.8c.3-.3.7-.4 1.1-.3l2.1.7c.5.1.8.6.8 1.1v1.6Z" />
            </svg>
            <a href="https://wa.me/5493513866592">351 386-6592 (WhatsApp)</a>
          </p>
        </div>
      </div>
    </footer>
  )
}
