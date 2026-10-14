import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCarrito } from '../pages/tienda/CarritoContext'
import { useTiendaCatalogo } from '../pages/tienda/useTiendaCatalogo'
import { esStockBajo } from '../pages/tienda/stock'
import { IconCarne, IconVerdura, IconGrilla, IconEtiqueta, IconCaja } from '../pages/tienda/iconos'
import { fmtPrecio, sufijoUnidad, esUnidadKg, normalizar } from './mobileFormato'
import './mobile.css'

const CATEGORIAS = {
  carniceria: { titulo: 'Carnicería', sub: 'Carne fresca, de primera calidad.', img: '/images/carniceria.png', color: '#a8241d' },
  verduleria: { titulo: 'Verdulería', sub: 'Frutas y verduras frescas, directo del campo.', img: '/images/verduelria.png', color: '#2c6e2f' },
  mas_productos: { titulo: 'Más productos', sub: 'Todo lo que necesitás, en un solo lugar.', img: '/images/mas-productos.png', color: '#7a3b12' },
}

const CHIPS = [
  { id: 'todo', label: 'Todo', Icono: null },
  { id: 'ofertas', label: 'Ofertas', Icono: IconEtiqueta },
  { id: 'carniceria', label: 'Carnicería', Icono: IconCarne },
  { id: 'verduleria', label: 'Verdulería', Icono: IconVerdura },
  { id: 'mas_productos', label: 'Más productos', Icono: IconGrilla },
  { id: 'combos', label: 'Combos', Icono: IconCaja },
]

function vmProducto(p, items) {
  const unidad = p.unidades_venta_producto?.[0]
  if (!unidad) return null
  const multi = p.unidades_venta_producto.length > 1
  const precioNormal = Number(unidad.precio_venta)
  const promo = unidad.precio_promocional != null ? Number(unidad.precio_promocional) : null
  const bloqueado = esStockBajo(p)
  const clave = unidad.id
  const enCarrito = items.find((i) => i.clave === clave)

  return {
    ruta: `p-${p.id}`,
    nombre: p.nombre,
    imagen: p.imagen_url,
    precio: fmtPrecio(promo ?? precioNormal),
    precioViejo: promo != null ? fmtPrecio(precioNormal) : null,
    sufijo: sufijoUnidad(unidad.nombre_unidad),
    multi,
    bloqueado,
    clave,
    cantidad: enCarrito?.cantidad ?? 0,
    item: {
      producto_id: p.id,
      producto_nombre: p.nombre,
      unidad_venta_id: unidad.id,
      unidad_nombre: unidad.nombre_unidad,
      precio_venta: promo ?? precioNormal,
      imagen_url: p.imagen_url ?? null,
    },
    kg: esUnidadKg(unidad.nombre_unidad),
  }
}

function vmCombo(c, items) {
  const clave = `combo:${c.id}`
  const enCarrito = items.find((i) => i.clave === clave)
  return {
    ruta: `c-${c.id}`,
    nombre: c.nombre,
    imagen: c.imagen_url,
    precio: fmtPrecio(c.precio_fijo),
    precioViejo: null,
    sufijo: '/ combo',
    multi: false,
    bloqueado: false,
    clave,
    cantidad: enCarrito?.cantidad ?? 0,
    item: {
      combo_id: c.id,
      producto_nombre: c.nombre,
      unidad_nombre: 'Combo',
      precio_venta: Number(c.precio_fijo),
      imagen_url: c.imagen_url ?? null,
    },
    kg: false,
  }
}

function TarjetaProducto({ vm, onAbrir, onAgregar, onCambiarCantidad }) {
  return (
    <div className="mob-card">
      <button type="button" className="mob-card-imagen" onClick={onAbrir}>
        {vm.imagen ? (
          <img src={vm.imagen} alt={vm.nombre} loading="lazy" />
        ) : (
          <img className="mob-card-imagen-vacia" src="/images/logo-marcal.png" alt="" loading="lazy" />
        )}
        {vm.precioViejo && <span className="mob-badge-oferta">OFERTA</span>}
      </button>
      <div className="mob-card-body">
        <div className="mob-card-name">{vm.nombre}</div>
        <div className="mob-card-precio-fila">
          <span className="mob-card-precio">{vm.precio}</span>
          <span className="mob-card-sufijo">{vm.sufijo}</span>
        </div>
        {vm.precioViejo && <span className="mob-card-precio-viejo">{vm.precioViejo}</span>}

        <div className="mob-card-accion">
          {vm.bloqueado ? (
            <div className="mob-card-sinstock">Sin stock por hoy</div>
          ) : vm.cantidad > 0 ? (
            <div className="mob-qty-stepper">
              <button type="button" onClick={() => onCambiarCantidad(vm, -1)}>
                −
              </button>
              <span>{vm.cantidad}</span>
              <button type="button" onClick={() => onCambiarCantidad(vm, 1)}>
                +
              </button>
            </div>
          ) : (
            <button type="button" className="mob-add-btn" onClick={onAgregar}>
              <span>+</span>Agregar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function CatalogoMobile() {
  const navigate = useNavigate()
  const { cliente, loading: loadingAuth } = useAuth()
  const { items, agregarItem, actualizarCantidad, quitarItem, cantidadTotal, totalCarrito } = useCarrito()
  const { productos, loading, error, combosDisponibles, enPromocion } = useTiendaCatalogo()

  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('todo')
  const [toast, setToast] = useState(null)

  function avisar(texto) {
    setToast(texto)
    setTimeout(() => setToast(null), 1600)
  }

  function abrir(vm) {
    navigate(`/tienda/producto/${vm.ruta}`)
  }

  function agregar(vm) {
    if (vm.multi) {
      abrir(vm)
      return
    }
    agregarItem(vm.item, 1)
    avisar(`${vm.nombre} agregado`)
  }

  function cambiarCantidad(vm, direccion) {
    const paso = vm.kg ? 0.5 : 1
    const nueva = +(vm.cantidad + direccion * paso).toFixed(2)
    if (nueva <= 0) quitarItem(vm.clave)
    else actualizarCantidad(vm.clave, nueva)
  }

  const qBuscado = normalizar(busqueda.trim())

  const secciones = useMemo(() => {
    const vmsProductos = (lista) => lista.map((p) => vmProducto(p, items)).filter(Boolean)
    const vmsCombos = (lista) => lista.map((c) => vmCombo(c, items))

    if (qBuscado) {
      const prods = productos.filter((p) => normalizar(p.nombre).includes(qBuscado))
      const combos = combosDisponibles.filter((c) => normalizar(c.nombre).includes(qBuscado))
      const itemsVm = [...vmsProductos(prods), ...vmsCombos(combos)]
      return [{ key: 'busqueda', titulo: `${itemsVm.length} resultado${itemsVm.length === 1 ? '' : 's'}`, items: itemsVm, vacio: itemsVm.length === 0 }]
    }

    if (categoria === 'ofertas') {
      return [{ key: 'ofertas', titulo: 'Ofertas de la semana', items: vmsProductos(enPromocion), vacio: enPromocion.length === 0 }]
    }

    if (categoria === 'combos') {
      return [{ key: 'combos', titulo: 'Combos', items: vmsCombos(combosDisponibles), vacio: combosDisponibles.length === 0 }]
    }

    if (categoria !== 'todo') {
      const meta = CATEGORIAS[categoria]
      const lista = productos.filter((p) => p.categoria === categoria)
      return [{ key: categoria, titulo: meta.titulo, banner: meta, items: vmsProductos(lista), vacio: lista.length === 0 }]
    }

    // 'todo': cada categoría con hasta 4 productos + "ver todos"; combos
    // al final con hasta 4 también.
    const bloques = Object.entries(CATEGORIAS).map(([clave, meta]) => {
      const lista = productos.filter((p) => p.categoria === clave)
      return {
        key: clave,
        titulo: meta.titulo,
        banner: meta,
        items: vmsProductos(lista.slice(0, 4)),
        verTodos: lista.length > 4 ? () => setCategoria(clave) : null,
        vacio: lista.length === 0,
      }
    })
    bloques.push({
      key: 'combos',
      titulo: 'Combos',
      banner: { titulo: 'Combos', sub: 'Armados para ahorrar, listos para llevar.', img: '/images/combos.jpg', color: '#a8371a' },
      items: vmsCombos(combosDisponibles.slice(0, 4)),
      verTodos: combosDisponibles.length > 4 ? () => setCategoria('combos') : null,
      vacio: combosDisponibles.length === 0,
    })
    return bloques
  }, [qBuscado, categoria, productos, combosDisponibles, enPromocion, items])

  return (
    <div className="mob-app">
      <div className="mob-home-header">
        <div className="mob-home-header-top">
          <img src="/images/logo-marcal.png" alt="" className="mob-home-logo" />
          <div className="mob-home-titulo">
            <div className="mob-home-marca">MAR-CAL</div>
            <div className="mob-home-subtitulo">Carnicería y Verdulería</div>
          </div>
          {!loadingAuth && (
            <Link to={cliente ? '/tienda/mis-pedidos' : '/tienda/login'} className="mob-header-btn">
              {cliente ? 'Pedidos' : 'Iniciar sesión'}
            </Link>
          )}
        </div>
        <div className="mob-home-tagline">
          <span>Pesado al momento</span>
          <span>•</span>
          <span>Envío por zona</span>
          <span>•</span>
          <span>Mercado Pago</span>
        </div>
      </div>

      <div className="mob-search-wrap">
        <label className="mob-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b5f55" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar carne, verdura, combo…"
          />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda">
              ×
            </button>
          )}
        </label>
      </div>

      <div className="mob-chips">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`mob-chip${categoria === c.id && !qBuscado ? ' activo' : ''}`}
            onClick={() => {
              setCategoria(c.id)
              setBusqueda('')
            }}
          >
            {c.Icono && <c.Icono width={16} height={16} />}
            {c.label}
          </button>
        ))}
      </div>

      <div className="mob-secciones">
        {loading && <p className="mob-placeholder">Cargando productos...</p>}
        {error && <p className="mob-placeholder">No pudimos cargar el catálogo.</p>}

        {!loading &&
          !error &&
          secciones.map((sec) => (
            <div key={sec.key} className="mob-section">
              {sec.banner && (
                <div className="mob-section-banner" style={{ backgroundImage: `url('${sec.banner.img}')` }}>
                  <div className="mob-section-banner-overlay" style={{ color: sec.banner.color }}>
                    <div className="mob-section-banner-titulo">{sec.titulo}</div>
                    <div className="mob-section-banner-sub">{sec.banner.sub}</div>
                  </div>
                </div>
              )}
              {!sec.banner && <div className="mob-section-titulo-plano">{sec.titulo}</div>}

              {sec.vacio ? (
                <p className="mob-empty">
                  {sec.key === 'busqueda' ? (
                    <>No encontramos productos con ese nombre.<br />Probá con otra palabra.</>
                  ) : (
                    'Todavía no hay productos en esta categoría.'
                  )}
                </p>
              ) : (
                <div className="mob-grid">
                  {sec.items.map((vm) => (
                    <TarjetaProducto
                      key={vm.ruta}
                      vm={vm}
                      onAbrir={() => abrir(vm)}
                      onAgregar={() => agregar(vm)}
                      onCambiarCantidad={cambiarCantidad}
                    />
                  ))}
                </div>
              )}

              {sec.verTodos && (
                <button type="button" className="mob-ver-todos" onClick={sec.verTodos}>
                  Ver todos los productos de {sec.titulo.toLowerCase()}
                </button>
              )}
            </div>
          ))}

        <p className="mob-pie">Arenales 345, Barrio Juniors · En el barrio desde 1998</p>
      </div>

      <Link to="/tienda/carrito" className={`mob-cart-bar${cantidadTotal ? ' con-items' : ''}`}>
        <span className="mob-cart-bar-icono">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
            <path d="M9 8V6a3 3 0 0 1 6 0v2" />
          </svg>
          {cantidadTotal > 0 && <span className="mob-cart-bar-badge">{cantidadTotal}</span>}
        </span>
        <span className="mob-cart-bar-label">{cantidadTotal ? 'Ver carrito' : 'Tu carrito está vacío'}</span>
        {cantidadTotal > 0 && <span className="mob-cart-bar-total">{fmtPrecio(totalCarrito)}</span>}
      </Link>

      {toast && <div className="mob-toast">✓ {toast}</div>}
    </div>
  )
}
