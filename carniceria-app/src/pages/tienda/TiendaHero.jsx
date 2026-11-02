import { IconChevronAbajo } from './iconos'

// Fondos del hero. posicion: qué parte de la foto queda visible con el
// recorte de "cover". tamano: reemplaza a "cover" -- en 2.png agranda la foto
// lo justo para que, alineada abajo, la pizarra con texto (el 30% de arriba)
// quede fuera del hero en cualquier pantalla. El 100vh - 6.5rem es la altura
// del hero, y el 2.2 sale de la proporción 3:2 de la foto dividida por el 68%
// que queda visible.
const HERO_SLIDES = [
  { imagen: '/images/1.png', posicion: 'center 55%' },
  { imagen: '/images/tienda-banner.png', posicion: 'center' },
  { imagen: '/images/2.png', posicion: 'center bottom', tamano: 'max(100%, calc(2.2 * (100vh - 6.5rem)))' },
]

function irA(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Hero de compu y de mobile. idProductos: a dónde lleva "Ver productos", que
// no es lo mismo en las dos versiones.
export function TiendaHero({ idProductos }) {
  return (
    <div className="tienda-hero-full">
      <div className="tienda-hero-slides" aria-hidden="true">
        {HERO_SLIDES.map(({ imagen, posicion, tamano }) => (
          <div
            key={imagen}
            className="tienda-hero-slide"
            style={{ backgroundImage: `url('${imagen}')`, backgroundPosition: posicion, backgroundSize: tamano }}
          />
        ))}
      </div>
      <div className="tienda-hero-overlay" />
      <div className="tienda-hero-inner">
        <div className="tienda-hero-texto">
          <h1>
            Calidad y frescura
            <span>en un solo lugar</span>
          </h1>
          <p>Hacé tu pedido y recibilo en tu zona.</p>
          <button type="button" className="tienda-hero-cta" onClick={() => irA(idProductos)}>
            Ver productos
          </button>
        </div>
        <img src="/images/logo-animado-sin-fondo.webp" alt="Mar-Cal" className="tienda-hero-logo" />
      </div>
      <button
        type="button"
        className="tienda-hero-scroll"
        onClick={() => irA('seccion-nosotros')}
        aria-label="Ir a Sobre Mar-Cal"
      >
        <IconChevronAbajo width={36} height={36} aria-hidden="true" />
      </button>
    </div>
  )
}
