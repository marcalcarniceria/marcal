import { useEffect, useRef, useState } from 'react'
import { ProductoCard } from './ProductoCard'

// tono: 'carniceria' | 'verduleria' (solo cambia el color de acentos).
// El botón "Ver todos" es solo visual por ahora: sin onClick a propósito.
export function CategoriaBloque({ tono, imagen, alt, productos, agregarItem }) {
  const filaRef = useRef(null)
  // desborda: la fila no entra entera (reserva el carril de la flecha).
  // alFinal: ya se scrolleó hasta el último producto (oculta la flecha).
  // Son dos flags separados para que reservar el carril no cambie lo que
  // se mide y genere un parpadeo.
  const [estado, setEstado] = useState({ desborda: false, alFinal: true })

  function actualizarEstado() {
    const fila = filaRef.current
    if (!fila) return
    setEstado({
      desborda: fila.scrollWidth > fila.clientWidth + 1,
      alFinal: fila.scrollWidth - fila.clientWidth - fila.scrollLeft <= 8,
    })
  }

  // ResizeObserver dispara al observar por primera vez, así que también
  // calcula el estado inicial cuando ya están cargados los productos.
  useEffect(() => {
    const fila = filaRef.current
    if (!fila) return
    const observer = new ResizeObserver(actualizarEstado)
    observer.observe(fila)
    return () => observer.disconnect()
  }, [productos])

  function desplazar() {
    const fila = filaRef.current
    if (!fila) return
    fila.scrollBy({ left: fila.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <div className={`tienda-categoria tienda-categoria-${tono}`}>
      <div className="tienda-categoria-imagen">
        <img src={imagen} alt={alt} loading="lazy" />
        <button type="button" className="tienda-categoria-vertodos">
          Ver todos →
        </button>
      </div>

      <div className={`tienda-categoria-productos${estado.desborda ? ' con-flecha' : ''}`}>
        {productos.length === 0 ? (
          <p className="tienda-categoria-vacia">Todavía no hay productos en esta categoría.</p>
        ) : (
          <>
            <div className="tienda-categoria-fila" ref={filaRef} onScroll={actualizarEstado}>
              {productos.map((producto) => (
                <ProductoCard
                  key={producto.id}
                  producto={producto}
                  agregarItem={agregarItem}
                  className="tienda-card-fila"
                />
              ))}
            </div>
            {estado.desborda && !estado.alFinal && (
              <button
                type="button"
                className="tienda-categoria-flecha"
                onClick={desplazar}
                aria-label="Ver más productos"
              >
                ›
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
