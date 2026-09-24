import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const CarritoContext = createContext(undefined)

const STORAGE_KEY = 'carniceria_carrito'

// Identifica cada renglón del carrito: los productos por su unidad de
// venta (como siempre) y los combos por su id, con prefijo para que nunca
// choquen. Se guarda en el item como `clave`.
function claveDe(item) {
  return item.combo_id ? `combo:${item.combo_id}` : item.unidad_venta_id
}

function cargarInicial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { items: [] }
    const guardado = JSON.parse(raw)
    // Carritos guardados antes de que existieran los combos no tienen
    // `clave`: se completa al cargar.
    return { items: (guardado.items ?? []).map((i) => ({ ...i, clave: claveDe(i) })) }
  } catch {
    return { items: [] }
  }
}

export function CarritoProvider({ children }) {
  const inicial = cargarInicial()
  const [items, setItems] = useState(inicial.items)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items }))
  }, [items])

  // item: producto { producto_id, unidad_venta_id, ... } o combo
  // { combo_id, ... }. En los dos casos precio_venta es el precio a cobrar
  // y producto_nombre/unidad_nombre lo que se muestra.
  function agregarItem(item) {
    const clave = claveDe(item)
    setItems((prev) => {
      const existente = prev.find((i) => i.clave === clave)
      if (existente) {
        return prev.map((i) => (i.clave === clave ? { ...i, cantidad: i.cantidad + 1 } : i))
      }
      return [...prev, { ...item, clave, cantidad: 1 }]
    })
  }

  function actualizarCantidad(clave, cantidad) {
    setItems((prev) => prev.map((i) => (i.clave === clave ? { ...i, cantidad } : i)))
  }

  function quitarItem(clave) {
    setItems((prev) => prev.filter((i) => i.clave !== clave))
  }

  function vaciarCarrito() {
    setItems([])
  }

  const cantidadTotal = useMemo(() => items.reduce((acc, i) => acc + i.cantidad, 0), [items])
  const totalCarrito = useMemo(
    () => items.reduce((acc, i) => acc + i.cantidad * i.precio_venta, 0),
    [items],
  )

  const value = {
    items,
    agregarItem,
    actualizarCantidad,
    quitarItem,
    vaciarCarrito,
    cantidadTotal,
    totalCarrito,
  }

  return <CarritoContext.Provider value={value}>{children}</CarritoContext.Provider>
}

export function useCarrito() {
  const context = useContext(CarritoContext)
  if (context === undefined) {
    throw new Error('useCarrito debe usarse dentro de un CarritoProvider')
  }
  return context
}
