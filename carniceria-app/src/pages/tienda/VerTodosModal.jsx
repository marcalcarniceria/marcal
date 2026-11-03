import { useEffect, useRef, useState } from 'react'
import { ProductoCard } from './ProductoCard'

function normalizar(texto) {
  return (texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// Modal "Ver todos" de un bloque de categoría -- reusa exactamente los
// mismos datos y la misma tarjeta (ProductoCard o, para Combos, la Card
// que ya le pasa CategoriaBloque) que la fila horizontal de la home, solo
// cambia la presentación a una grilla con buscador.
export function VerTodosModal({ titulo, productos, Card, agregarItem, onCerrar }) {
  const [busqueda, setBusqueda] = useState('')
  const modalRef = useRef(null)
  const inputRef = useRef(null)
  const elementoPrevioRef = useRef(null)

  // Foco al abrir (en el buscador, para poder tipear de una) y vuelta al
  // botón "Ver todos" que abrió el modal al cerrar -- document.activeElement
  // en el momento del mount es justo ese botón, porque recién lo tocaron.
  useEffect(() => {
    elementoPrevioRef.current = document.activeElement
    inputRef.current?.focus()

    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function alPresionarTecla(e) {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', alPresionarTecla)

    return () => {
      document.body.style.overflow = overflowPrevio
      window.removeEventListener('keydown', alPresionarTecla)
      elementoPrevioRef.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const qBuscado = normalizar(busqueda.trim())
  const productosFiltrados = qBuscado
    ? productos.filter((p) => normalizar(p.nombre).includes(qBuscado))
    : productos

  return (
    <div className="tienda-modal-overlay tienda-vertodos-overlay" onClick={onCerrar}>
      <div
        ref={modalRef}
        className="tienda-modal tienda-vertodos-modal"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tienda-vertodos-header">
          <h2>{titulo}</h2>
          <button type="button" className="tienda-modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>

        <input
          ref={inputRef}
          type="text"
          className="tienda-vertodos-buscador"
          placeholder={`Buscar en ${titulo.toLowerCase()}...`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        <div className="tienda-vertodos-body">
          {productosFiltrados.length === 0 ? (
            <p className="tienda-categoria-vacia">No encontramos productos con ese nombre.</p>
          ) : (
            <div className="tienda-vertodos-grid">
              {productosFiltrados.map((producto) =>
                Card ? (
                  <Card key={producto.id} item={producto} agregarItem={agregarItem} />
                ) : (
                  <ProductoCard key={producto.id} producto={producto} agregarItem={agregarItem} />
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
