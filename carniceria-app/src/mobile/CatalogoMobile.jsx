import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCarrito } from '../pages/tienda/CarritoContext'
import { useTiendaCatalogo } from '../pages/tienda/useTiendaCatalogo'
import { esStockBajo } from '../pages/tienda/stock'
import { camposPromoDeUnidad, etiquetaCantidad, preciosDeUnidad, promoDeUnidad } from '../pages/tienda/precios'
import { InputCantidad } from '../pages/tienda/InputCantidad'
import { IconCarne, IconVerdura, IconGrilla, IconEtiqueta, IconCaja } from '../pages/tienda/iconos'
import { TiendaHero } from '../pages/tienda/TiendaHero'
import { TiendaTopbar } from '../pages/tienda/TiendaTopbar'
import { SobreMarCal } from '../pages/tienda/SobreMarCal'
import { RevelarProvider } from '../pages/tienda/Revelar'
import { useHeaderCompacto } from '../pages/tienda/useHeaderCompacto'
import { fmtPrecio, sufijoUnidad, esUnidadKg, normalizar } from './mobileFormato'
import './mobile.css'

// Estas imágenes ya traen el título dibujado: sub es solo su texto alternativo.
// ancho/alto: tamaño real, para reservar el lugar antes de que cargue.
const CATEGORIAS = {
  carniceria: { titulo: 'Carnicería', sub: 'Carne fresca, de primera calidad.', img: '/images/carniceria.png', ancho: 1361, alto: 1046, color: '#a8241d' },
  verduleria: { titulo: 'Verdulería', sub: 'Frutas y verduras frescas, directo del campo.', img: '/images/verduelria.png', ancho: 1443, alto: 1090, color: '#2c6e2f' },
  mas_productos: { titulo: 'Más productos', sub: 'Todo lo que necesitás, en un solo lugar.', img: '/images/mas-productos.png', ancho: 1444, alto: 1089, color: '#7a3b12' },
}

// combos.jpg es solo fondo: el título va en HTML, igual que en compu.
const BANNER_COMBOS = {
  titulo: 'Combos',
  sub: 'Armados para ahorrar, listos para llevar.',
  img: '/images/combos.jpg',
  ancho: 1024,
  alto: 1024,
  color: 'var(--color-primario)',
  Icono: IconCaja,
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
  const { cobrar, tachado, directa, descuento } = preciosDeUnidad(unidad)
  const bloqueado = esStockBajo(p)
  const clave = unidad.id
  const enCarrito = items.find((i) => i.clave === clave)
  const promo = promoDeUnidad(unidad)
  const etiqueta = etiquetaCantidad(unidad.nombre_unidad)

  return {
    ruta: `p-${p.id}`,
    nombre: p.nombre,
    imagen: p.imagen_url,
    precio: fmtPrecio(cobrar),
    precioViejo: tachado !== null ? fmtPrecio(tachado) : null,
    ofertaDirecta: directa,
    descuento,
    promo: promo && `Promo: ${promo.cantidad} ${etiqueta} x ${fmtPrecio(promo.precio)}`,
    etiqueta,
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
      precio_venta: cobrar,
      ...camposPromoDeUnidad(unidad),
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

function BannerCategoria({ banner, verTodos }) {
  const { titulo, sub, img, ancho, alto, color, Icono } = banner

  return (
    <div className="mob-section-banner" style={{ '--tono': color }}>
      <img src={img} alt={Icono ? '' : `${titulo}: ${sub}`} width={ancho} height={alto} loading="lazy" />
      {Icono && (
        <div className="tienda-categoria-rotulo">
          <Icono className="tienda-categoria-rotulo-icono" aria-hidden="true" />
          <div>
            <div className="tienda-categoria-rotulo-titulo">{titulo}</div>
            <p className="tienda-categoria-rotulo-subtitulo">{sub}</p>
          </div>
        </div>
      )}
      {verTodos && (
        <button
          type="button"
          className="mob-section-banner-vertodos"
          onClick={verTodos}
          aria-label={`Ver todos los productos de ${titulo.toLowerCase()}`}
        >
          Ver todos →
        </button>
      )}
    </div>
  )
}

function TarjetaProducto({ vm, onAbrir, onAgregar, onCambiarCantidad }) {
  const [cantidad, setCantidad] = useState(1)
  // Con varias presentaciones la cantidad se elige en el detalle, y los combos
  // son siempre enteros: esos siguen con el botón solo.
  const conInput = !vm.multi && !vm.item.combo_id

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
        {vm.ofertaDirecta && <del className="mob-card-precio-viejo">{vm.precioViejo}</del>}
        <div className="mob-card-precio-fila">
          <span className={`mob-card-precio${vm.ofertaDirecta ? ' mob-card-precio-oferta' : ''}`}>{vm.precio}</span>
          <span className="mob-card-sufijo">{vm.sufijo}</span>
          {vm.ofertaDirecta && vm.descuento > 0 && <span className="mob-card-descuento">-{vm.descuento}%</span>}
        </div>
        {vm.precioViejo && !vm.ofertaDirecta && <span className="mob-card-precio-viejo">{vm.precioViejo}</span>}
        {vm.promo && <span className="mob-card-promo">{vm.promo}</span>}

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
            <>
              {conInput && (
                <label className="mob-card-cantidad">
                  <InputCantidad value={cantidad} onChange={setCantidad} aria-label={`Cantidad de ${vm.nombre}`} />
                  <span>{vm.etiqueta}</span>
                </label>
              )}
              <button type="button" className="mob-add-btn" onClick={() => onAgregar(cantidad)}>
                <span>+</span>Agregar
              </button>
            </>
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
  const compacto = useHeaderCompacto()

  function avisar(texto) {
    setToast(texto)
    setTimeout(() => setToast(null), 1600)
  }

  function abrir(vm) {
    navigate(`/tienda/producto/${vm.ruta}`)
  }

  function agregar(vm, cantidad) {
    if (vm.multi) {
      abrir(vm)
      return
    }
    agregarItem(vm.item, vm.item.combo_id ? 1 : cantidad)
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
      banner: BANNER_COMBOS,
      items: vmsCombos(combosDisponibles.slice(0, 4)),
      verTodos: combosDisponibles.length > 4 ? () => setCategoria('combos') : null,
      vacio: combosDisponibles.length === 0,
    })
    return bloques
  }, [qBuscado, categoria, productos, combosDisponibles, enPromocion, items])

  return (
    <div className="mob-app">
      {/* Mismo header que compu (estilos en tienda.css), con los accesos de mobile. */}
      <div className="tienda-header-espacio" aria-hidden="true" />

      <header className={`tienda-header${compacto ? ' tienda-header-compacto' : ''}`}>
        <TiendaTopbar />

        <div className="tienda-navbar">
          <Link to="/tienda" className="tienda-logo">
            <img src="/images/logo-marcal.png" alt="Mar-Cal" className="tienda-logo-img" />
            <span className="tienda-logo-texto">
              <small>Carnicería y Verdulería</small>
            </span>
          </Link>
          {!loadingAuth && (
            <Link to={cliente ? '/tienda/mis-pedidos' : '/tienda/login'} className="mob-header-btn">
              {cliente ? 'Pedidos' : 'Iniciar sesión'}
            </Link>
          )}
        </div>
      </header>

      <TiendaHero idProductos="mob-productos" />

      <RevelarProvider>
        <SobreMarCal />
      </RevelarProvider>

      <div className="mob-home-header">
        <div className="mob-home-tagline">
          <span>Pesado al momento</span>
          <span>•</span>
          <span>Envío por zona</span>
          <span>•</span>
          <span>Mercado Pago</span>
        </div>
      </div>

      <div id="mob-productos" className="mob-search-wrap">
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
              {sec.banner && <BannerCategoria banner={sec.banner} verTodos={sec.verTodos} />}
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
                      onAgregar={(cantidad) => agregar(vm, cantidad)}
                      onCambiarCantidad={cambiarCantidad}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
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
