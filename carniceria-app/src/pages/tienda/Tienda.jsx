import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { SUCURSAL_ID } from '../../config/sucursal'
import { useCarrito } from './CarritoContext'
import { TiendaHeader } from './TiendaHeader'
import { ProductoCard } from './ProductoCard'
import { CategoriaBloque } from './CategoriaBloque'
import {
  IconCarne,
  IconVerdura,
  IconEtiqueta,
  IconCaja,
  IconGrilla,
  IconCalendario,
  IconEstrella,
  IconEnvio,
  IconLocal,
} from './iconos'

const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/VT52EVQrtpZ2KUWJ8'

const FILTROS_CATEGORIA = [
  { nombre: 'Carnicería', Icono: IconCarne },
  { nombre: 'Verdulería', Icono: IconVerdura },
  { nombre: 'Promociones', Icono: IconEtiqueta },
  { nombre: 'Combos', Icono: IconCaja },
  { nombre: 'Más productos', Icono: IconGrilla },
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

  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('productos')
      .select('*, unidades_venta_producto(*)')
      .eq('sucursal_id', SUCURSAL_ID)
      .eq('activo', true)
      .then(({ data, error }) => {
        if (error) setError(error)
        else setProductos(data)
        setLoading(false)
      })
  }, [])

  // Los que ya tienen categoría se muestran dentro de su bloque
  // (Carnicería/Verdulería/Más Productos); acá abajo quedan solo los que
  // todavía no tienen ninguna asignada. Con las tres categorías cargadas
  // hoy este array puede quedar vacío -- la sección de abajo ya tiene el
  // guard sinCategoria.length > 0, así que simplemente no se renderiza.
  const sinCategoria = productos.filter((p) => !p.categoria)

  function irAProductos() {
    document.getElementById('vidriera-productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <TiendaHeader />

      <div
        className="tienda-hero-full"
        style={{ backgroundImage: "url('/images/banner-marcal.png')" }}
      >
        <div className="tienda-hero-overlay" />
      </div>

      <div className="tienda-nosotros">
        <div className="tienda-nosotros-inner">
          <div className="tienda-nosotros-card">
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
          </div>
        </div>
      </div>

      <div className="tienda-resenas" style={{ backgroundImage: "url('/images/2.png')" }}>
        <div className="tienda-resenas-overlay" />
        <div className="tienda-resenas-inner">
          <h2>Lo que dicen nuestros clientes</h2>
          <div className="tienda-resenas-grid">
            {RESENAS.map((r) => (
              <div key={r.autor} className="tienda-resena-card">
                <div className="tienda-resena-estrellas">★★★★★</div>
                <p className="tienda-resena-texto">"{r.texto}"</p>
                <p className="tienda-resena-autor">{r.autor}</p>
              </div>
            ))}
          </div>
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
        <div className="tienda-confianza-inner">
          {CONFIANZA.map(({ Icono, dato, frase }) => (
            <div key={dato} className="tienda-confianza-item">
              <div className="tienda-confianza-icono">
                <Icono aria-hidden="true" />
              </div>
              <div className="tienda-confianza-texto">
                <div className="tienda-confianza-dato">{dato}</div>
                <p className="tienda-confianza-frase">{frase}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="tienda-vidriera">
        <div
          className="tienda-vidriera-banner"
          style={{ backgroundImage: "url('/images/tienda-banner.png')" }}
        >
          <div className="tienda-vidriera-banner-contenido">
            <h2>
              Calidad y frescura
              <span>en un solo lugar</span>
            </h2>
            <p>Las mejores carnes y verduras, todos los días.</p>
            <button type="button" className="tienda-vidriera-cta" onClick={irAProductos}>
              Ver productos
            </button>
          </div>
        </div>

        <div className="tienda-vidriera-inner">
          <div className="tienda-filtros">
            {FILTROS_CATEGORIA.map(({ nombre, Icono }) => (
              <button key={nombre} type="button" className="tienda-filtro">
                <Icono aria-hidden="true" />
                {nombre}
              </button>
            ))}
          </div>
        </div>

        <div id="vidriera-productos" className="tienda-vidriera-categorias">
          {loading && <p>Cargando productos...</p>}
          {!loading && !error && (
            <>
              <CategoriaBloque
                tono="carniceria"
                imagen="/images/carniceria.png"
                alt="Carnicería: carne fresca, de primera calidad"
                productos={productos.filter((p) => p.categoria === 'carniceria')}
                agregarItem={agregarItem}
              />
              <CategoriaBloque
                tono="verduleria"
                imagen="/images/verduelria.png"
                alt="Verdulería: frutas y verduras frescas, directo del campo"
                productos={productos.filter((p) => p.categoria === 'verduleria')}
                agregarItem={agregarItem}
              />
              <CategoriaBloque
                tono="mas-productos"
                imagen="/images/mas-productos.png"
                alt="Más Productos: todo lo que necesitás, en un solo lugar"
                productos={productos.filter((p) => p.categoria === 'mas_productos')}
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
          <div className="tienda-grid">
            {sinCategoria.map((producto) => (
              <ProductoCard key={producto.id} producto={producto} agregarItem={agregarItem} />
            ))}
          </div>
        )}
        {!loading && !error && productos.length === 0 && <p>No hay productos disponibles.</p>}
      </div>
    </>
  )
}
