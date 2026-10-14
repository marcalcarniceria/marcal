import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCarrito } from '../pages/tienda/CarritoContext'
import { useTiendaCatalogo } from '../pages/tienda/useTiendaCatalogo'
import { MobileScreenHeader } from './MobileScreenHeader'
import { fmtPrecio, sufijoUnidad, esUnidadKg, fmtCantidad } from './mobileFormato'
import './mobile.css'

const CATEGORIA_LABEL = { carniceria: 'CARNICERÍA', verduleria: 'VERDULERÍA', mas_productos: 'ALMACÉN' }

function textoIngredientes(ingredientes) {
  return ingredientes.map((i) => `${Number(i.cantidad)} ${i.unidad_nombre} de ${i.producto_nombre}`).join(', ')
}

export function ProductoDetalleMobile() {
  const { productoId } = useParams()
  const navigate = useNavigate()
  const { agregarItem, items } = useCarrito()
  const { productos, combosDisponibles, loading } = useTiendaCatalogo()

  const [oi, setOi] = useState(0)
  const [cantidad, setCantidad] = useState(null) // null = todavía no se tocó, usa el default calculado

  const esCombo = productoId?.startsWith('c-')
  const id = productoId?.slice(2)

  const producto = !esCombo ? productos.find((p) => p.id === id) : null
  const combo = esCombo ? combosDisponibles.find((c) => c.id === id) : null

  const unidad = producto?.unidades_venta_producto?.[oi]
  const kg = unidad ? esUnidadKg(unidad.nombre_unidad) : false
  const paso = kg ? 0.5 : 1

  const clave = esCombo ? `combo:${combo?.id}` : unidad?.id
  const cantidadDefault = cantidad ?? (items.find((i) => i.clave === clave)?.cantidad || 1)

  const precioUnitario = esCombo ? Number(combo?.precio_fijo ?? 0) : Number(unidad?.precio_promocional ?? unidad?.precio_venta ?? 0)
  const precioNormal = esCombo ? null : Number(unidad?.precio_venta ?? 0)
  const enOferta = !esCombo && unidad?.precio_promocional != null

  const quickPicks = kg ? [0.5, 1, 1.5, 2] : []

  if (loading) {
    return (
      <div className="mob-app">
        <MobileScreenHeader onBack={() => navigate('/tienda')} />
        <p className="mob-placeholder">Cargando...</p>
      </div>
    )
  }

  if (!producto && !combo) {
    return (
      <div className="mob-app">
        <MobileScreenHeader onBack={() => navigate('/tienda')} />
        <p className="mob-placeholder">No encontramos este producto.</p>
      </div>
    )
  }

  function cambiarCantidad(delta) {
    setCantidad(+(Math.max(paso, cantidadDefault + delta * paso)).toFixed(2))
  }

  function agregarAlCarrito() {
    if (esCombo) {
      agregarItem(
        {
          combo_id: combo.id,
          producto_nombre: combo.nombre,
          unidad_nombre: 'Combo',
          precio_venta: Number(combo.precio_fijo),
          imagen_url: combo.imagen_url ?? null,
        },
        cantidadDefault,
      )
    } else {
      agregarItem(
        {
          producto_id: producto.id,
          producto_nombre: producto.nombre,
          unidad_venta_id: unidad.id,
          unidad_nombre: unidad.nombre_unidad,
          precio_venta: precioUnitario,
          imagen_url: producto.imagen_url ?? null,
        },
        cantidadDefault,
      )
    }
    navigate('/tienda')
  }

  const nombre = esCombo ? combo.nombre : producto.nombre
  const imagen = esCombo ? combo.imagen_url : producto.imagen_url
  const catLabel = !esCombo ? CATEGORIA_LABEL[producto.categoria] ?? '' : 'COMBO'

  return (
    <div className="mob-app">
      <div className="mob-detail-hero">
        {imagen ? <img src={imagen} alt={nombre} /> : <img className="mob-detail-hero-vacia" src="/images/logo-marcal.png" alt="" />}
        <button type="button" className="mob-detail-back" onClick={() => navigate(-1)} aria-label="Volver">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1c1916" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      </div>

      <div className="mob-detail-body">
        <div className="mob-detail-catlabel">{catLabel}</div>
        <div className="mob-detail-nombre">{nombre}</div>
        <div className="mob-detail-precio-fila">
          <span className="mob-detail-precio">{fmtPrecio(precioUnitario)}</span>
          {!esCombo && <span className="mob-detail-sufijo">{sufijoUnidad(unidad.nombre_unidad)}</span>}
          {enOferta && <span className="mob-detail-precioviejo">{fmtPrecio(precioNormal)}</span>}
        </div>

        {esCombo && combo.descripcion && <p className="mob-detail-desc">{combo.descripcion}</p>}
        {esCombo && combo.ingredientes?.length > 0 && (
          <p className="mob-detail-desc">
            <strong>Incluye:</strong> {textoIngredientes(combo.ingredientes)}
          </p>
        )}

        {!esCombo && producto.unidades_venta_producto.length > 1 && (
          <div className="mob-detail-presentaciones">
            <div className="mob-detail-subtitulo">Presentación</div>
            <div className="mob-presentacion-grid">
              {producto.unidades_venta_producto.map((u, i) => (
                <button
                  key={u.id}
                  type="button"
                  className={`mob-presentacion${i === oi ? ' activo' : ''}`}
                  onClick={() => {
                    setOi(i)
                    setCantidad(null)
                  }}
                >
                  <span>{u.nombre_unidad}</span>
                  <strong>{fmtPrecio(u.precio_promocional ?? u.precio_venta)}</strong>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mob-detail-cantidad">
          <div className="mob-detail-subtitulo">Cantidad</div>
          {kg && (
            <div className="mob-quick-grid">
              {quickPicks.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`mob-quick${Math.abs(v - cantidadDefault) < 1e-9 ? ' activo' : ''}`}
                  onClick={() => setCantidad(v)}
                >
                  {fmtCantidad(v, true)}
                </button>
              ))}
            </div>
          )}
          <div className="mob-detail-stepper">
            <button type="button" onClick={() => cambiarCantidad(-1)}>
              −
            </button>
            <span>{fmtCantidad(cantidadDefault, kg)}</span>
            <button type="button" onClick={() => cambiarCantidad(1)}>
              +
            </button>
          </div>
          {kg && (
            <div className="mob-detail-aviso">
              Lo pesamos al momento de armar tu pedido. El total final puede variar levemente según el peso.
            </div>
          )}
        </div>
      </div>

      <div className="mob-action-bar">
        <div className="mob-action-bar-total">
          <span>Total</span>
          <span>{fmtPrecio(precioUnitario * cantidadDefault)}</span>
        </div>
        <button type="button" className="mob-action-btn" onClick={agregarAlCarrito}>
          Agregar al carrito
        </button>
      </div>
    </div>
  )
}
