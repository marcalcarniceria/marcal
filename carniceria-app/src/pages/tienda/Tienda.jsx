import { useCarrito } from './CarritoContext'
import { useTiendaCatalogo } from './useTiendaCatalogo'
import { TiendaHeader } from './TiendaHeader'
import { ProductoCard } from './ProductoCard'
import { ComboCard } from './ComboCard'
import { CategoriaBloque } from './CategoriaBloque'
import { Revelar, RevelarGrupo, RevelarItem, RevelarProvider } from './Revelar'
import {
  IconCarne,
  IconVerdura,
  IconEtiqueta,
  IconCaja,
  IconChevronAbajo,
  IconGrilla,
  IconCalendario,
  IconEstrella,
  IconEnvio,
  IconLocal,
} from './iconos'

const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/VT52EVQrtpZ2KUWJ8'

// seccion: id del CategoriaBloque al que scrollea cada botón.
const FILTROS_CATEGORIA = [
  { nombre: 'Carnicería', Icono: IconCarne, seccion: 'seccion-carniceria' },
  { nombre: 'Verdulería', Icono: IconVerdura, seccion: 'seccion-verduleria' },
  { nombre: 'Más productos', Icono: IconGrilla, seccion: 'seccion-mas-productos' },
  { nombre: 'Promociones', Icono: IconEtiqueta, seccion: 'seccion-promociones' },
  { nombre: 'Combos', Icono: IconCaja, seccion: 'seccion-combos' },
]

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

const ANIO_INICIO = 1998
const ANIOS_EN_EL_BARRIO = new Date().getFullYear() - ANIO_INICIO

const CONFIANZA = [
  {
    Icono: IconCalendario,
    dato: `${ANIOS_EN_EL_BARRIO} años`,
    frase: `En el barrio, desde ${ANIO_INICIO}`,
  },
  { Icono: IconEstrella, dato: '5 estrellas', frase: 'En reseñas de Google' },
  { Icono: IconEnvio, dato: 'Envíos', frase: 'A domicilio por tu zona' },
  { Icono: IconLocal, dato: 'Todo en un lugar', frase: 'Carnicería y verdulería' },
]

const RESENAS = [
  {
    autor: 'Anna Szlejcher',
    texto:
      'Cada 15 días realizo mis compras en Mar-Cal Carnicería y Verdulería. No es muy cercana a mi domicilio pero tiene productos de calidad y con ofertas por dos kilos en la verdulería. La carne es muy tierna. La atención es excelente y el personal muy amable. Precios muy convenientes y acordes a la calidad de los productos.',
  },
  {
    autor: 'Laura Cabanillas',
    texto: 'Muy buena mercadería y precios razonables.',
  },
  {
    autor: 'Noelia Cofré',
    texto:
      'El mejor mercado de barrio de Córdoba. Me mudé hace 2 años a zona sur y sigo comprando en Mar-Cal. Los chicos y los dueños tienen la mejor atención.',
  },
]

export function Tienda() {
  const { agregarItem } = useCarrito()
  const { productos, loading, error, combosDisponibles, sinCategoria, enPromocion } = useTiendaCatalogo()

  function irAProductos() {
    document.getElementById('vidriera-productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function irANosotros() {
    document.getElementById('seccion-nosotros')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Mientras cargan los productos los bloques todavía no existen: el ?.
  // evita el error si el cliente toca un botón antes de tiempo.
  function irASeccion(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <RevelarProvider>
      <TiendaHeader />

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
            <button type="button" className="tienda-hero-cta" onClick={irAProductos}>
              Ver productos
            </button>
          </div>
          <img src="/images/logo-animado-sin-fondo.webp" alt="Mar-Cal" className="tienda-hero-logo" />
        </div>
        <button type="button" className="tienda-hero-scroll" onClick={irANosotros} aria-label="Ir a Sobre Mar-Cal">
          <IconChevronAbajo width={36} height={36} aria-hidden="true" />
        </button>
      </div>

      <div id="seccion-nosotros" className="tienda-nosotros">
        <div className="tienda-nosotros-inner">
          <Revelar className="tienda-nosotros-card">
            <h2>Sobre Mar-Cal</h2>
            <p>
              Somos una carnicería y verdulería de barrio en Arenales 345, Barrio Juniors.
              Trabajamos todos los días para ofrecerte carne, frutas y verduras de primera
              calidad, con el trato de siempre.
            </p>
            <p>
              Hacé tu pedido por WhatsApp o directo acá en la tienda, y coordinamos la entrega
              por tu zona.
            </p>
          </Revelar>
        </div>
      </div>

      <div className="tienda-resenas" style={{ backgroundImage: "url('/images/2.png')" }}>
        <div className="tienda-resenas-overlay" />
        <div className="tienda-resenas-inner">
          <h2>Lo que dicen nuestros clientes</h2>
          <RevelarGrupo className="tienda-resenas-grid">
            {RESENAS.map((r, indice) => (
              <RevelarItem key={r.autor} indice={indice}>
                <div className="tienda-resena-card">
                  <div className="tienda-resena-estrellas">★★★★★</div>
                  <p className="tienda-resena-texto">"{r.texto}"</p>
                  <p className="tienda-resena-autor">{r.autor}</p>
                </div>
              </RevelarItem>
            ))}
          </RevelarGrupo>
          <a
            href={GOOGLE_MAPS_URL}
            target="_blank"
            rel="noreferrer"
            className="tienda-google-link"
          >
            Ver todas las reseñas en Google →
          </a>
        </div>
      </div>

      <section className="tienda-confianza">
        <RevelarGrupo className="tienda-confianza-inner">
          {CONFIANZA.map(({ Icono, dato, frase }, indice) => (
            <RevelarItem key={dato} indice={indice}>
              <div className="tienda-confianza-item">
                <div className="tienda-confianza-icono">
                  <Icono aria-hidden="true" />
                </div>
                <div className="tienda-confianza-texto">
                  <div className="tienda-confianza-dato">{dato}</div>
                  <p className="tienda-confianza-frase">{frase}</p>
                </div>
              </div>
            </RevelarItem>
          ))}
        </RevelarGrupo>
      </section>

      <section className="tienda-vidriera">
        <div className="tienda-vidriera-inner">
          <Revelar className="tienda-filtros">
            {FILTROS_CATEGORIA.map(({ nombre, Icono, seccion }) => (
              <button
                key={nombre}
                type="button"
                className="tienda-filtro"
                onClick={() => irASeccion(seccion)}
              >
                <Icono aria-hidden="true" />
                {nombre}
              </button>
            ))}
          </Revelar>
        </div>

        <div id="vidriera-productos" className="tienda-vidriera-categorias">
          {loading && <p>Cargando productos...</p>}
          {!loading && !error && (
            <>
              <CategoriaBloque
                id="seccion-carniceria"
                tono="carniceria"
                imagen="/images/carniceria.png"
                alt="Carnicería: carne fresca, de primera calidad"
                productos={productos.filter((p) => p.categoria === 'carniceria')}
                agregarItem={agregarItem}
              />
              <CategoriaBloque
                id="seccion-verduleria"
                tono="verduleria"
                imagen="/images/verduelria.png"
                alt="Verdulería: frutas y verduras frescas, directo del campo"
                productos={productos.filter((p) => p.categoria === 'verduleria')}
                agregarItem={agregarItem}
              />
              <CategoriaBloque
                id="seccion-mas-productos"
                tono="mas-productos"
                imagen="/images/mas-productos.png"
                alt="Más Productos: todo lo que necesitás, en un solo lugar"
                productos={productos.filter((p) => p.categoria === 'mas_productos')}
                agregarItem={agregarItem}
              />
              <CategoriaBloque
                id="seccion-promociones"
                tono="promociones"
                imagen="/images/promociones.jpg"
                alt="Promociones: las mejores ofertas de la semana"
                Icono={IconEtiqueta}
                titulo="Promociones"
                subtitulo="Las mejores ofertas de la semana."
                productos={enPromocion}
                agregarItem={agregarItem}
              />
              <CategoriaBloque
                id="seccion-combos"
                tono="combos"
                imagen="/images/combos.jpg"
                alt="Combos: armados para ahorrar, listos para llevar"
                Icono={IconCaja}
                titulo="Combos"
                subtitulo="Armados para ahorrar, listos para llevar."
                productos={combosDisponibles}
                Card={ComboCard}
                agregarItem={agregarItem}
              />
            </>
          )}
        </div>
      </section>

      <div className="tienda-contenido">
        {error && <p className="tienda-error">{JSON.stringify(error)}</p>}
        {loading && <p>Cargando productos...</p>}

        {!loading && !error && sinCategoria.length > 0 && (
          <RevelarGrupo className="tienda-grid" amount="some">
            {sinCategoria.map((producto, indice) => (
              <RevelarItem key={producto.id} indice={indice}>
                <ProductoCard producto={producto} agregarItem={agregarItem} />
              </RevelarItem>
            ))}
          </RevelarGrupo>
        )}
        {!loading && !error && productos.length === 0 && <p>No hay productos disponibles.</p>}
      </div>
    </RevelarProvider>
  )
}
