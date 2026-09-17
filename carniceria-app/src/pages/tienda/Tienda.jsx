import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useCarrito } from './CarritoContext'
import { TiendaHeader } from './TiendaHeader'
import { IconBalanza, IconCamion, IconCarne, IconVerdura } from './iconos'

const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/VT52EVQrtpZ2KUWJ8'

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
  const { sucursalId, setSucursalId, agregarItem } = useCarrito()

  const [sucursales, setSucursales] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('sucursales')
      .select('*')
      .then(({ data, error }) => {
        if (error) setError(error)
        else {
          setSucursales(data)
          if (!sucursalId && data.length > 0) setSucursalId(data[0].id)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sucursalId) return
    setLoading(true)
    supabase
      .from('productos')
      .select('*, unidades_venta_producto(*)')
      .eq('sucursal_id', sucursalId)
      .eq('activo', true)
      .then(({ data, error }) => {
        if (error) setError(error)
        else setProductos(data)
        setLoading(false)
      })
  }, [sucursalId])

  return (
    <>
      <TiendaHeader />

      <div
        className="tienda-hero-full"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1781934909002-e2df1f0caf76?w=1600&q=80&auto=format&fit=crop')",
        }}
      >
        <div className="tienda-hero-overlay" />
        <div className="tienda-hero-inner">
          <IconCarne className="tienda-hero-icono tienda-hero-icono-1" />
          <IconVerdura className="tienda-hero-icono tienda-hero-icono-2" />
          <span className="tienda-badge-calidad">Todo de primera calidad</span>
          <h1>Carne, frutas y verduras de calidad</h1>
          <p>Hacenos tu pedido y coordinamos la entrega por tu zona.</p>
        </div>
      </div>

      <div className="tienda-contenido">
        <div className="tienda-ventajas">
          <div className="tienda-ventaja">
            <IconBalanza />
            <span>Primera calidad, pesado al momento</span>
          </div>
          <div className="tienda-ventaja">
            <IconCamion />
            <span>Envío a domicilio por zona</span>
          </div>
          <div className="tienda-ventaja">
            <IconVerdura />
            <span>Frutas y verduras frescas</span>
          </div>
        </div>

        <div className="tienda-nosotros">
          <img
            src="https://images.unsplash.com/photo-1489450278009-822e9be04dff?w=800&q=80&auto=format&fit=crop"
            alt="Puesto de frutas y verduras frescas"
            loading="lazy"
          />
          <div>
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

        <div className="tienda-resenas">
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

        {sucursales.length > 1 && (
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            Sucursal:{' '}
            <select
              className="tienda-sucursal-select"
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              style={{ color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && <p className="tienda-error">{JSON.stringify(error)}</p>}
        {loading && <p>Cargando productos...</p>}

        {!loading && !error && (
          <div className="tienda-grid">
            {productos.map((producto) => (
              <div key={producto.id} className="tienda-card">
                <h3>{producto.nombre}</h3>
                {producto.unidades_venta_producto?.map((unidad) => (
                  <div key={unidad.id} className="tienda-card-unidad">
                    <div>
                      <div className="tienda-card-unidad-nombre">{unidad.nombre_unidad}</div>
                      <div className="tienda-card-precio">${Number(unidad.precio_venta).toFixed(2)}</div>
                    </div>
                    <button
                      type="button"
                      className="tienda-btn"
                      onClick={() =>
                        agregarItem({
                          producto_id: producto.id,
                          producto_nombre: producto.nombre,
                          unidad_venta_id: unidad.id,
                          unidad_nombre: unidad.nombre_unidad,
                          precio_venta: Number(unidad.precio_venta),
                        })
                      }
                    >
                      Agregar
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {productos.length === 0 && <p>No hay productos disponibles en esta sucursal.</p>}
          </div>
        )}
      </div>
    </>
  )
}
