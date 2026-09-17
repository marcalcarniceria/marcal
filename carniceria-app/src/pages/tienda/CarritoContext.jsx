import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const CarritoContext = createContext(undefined)

const STORAGE_KEY = 'carniceria_carrito'

function cargarInicial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { items: [] }
    return JSON.parse(raw)
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

  function agregarItem(item) {
    setItems((prev) => {
      const existente = prev.find((i) => i.unidad_venta_id === item.unidad_venta_id)
      if (existente) {
        return prev.map((i) =>
          i.unidad_venta_id === item.unidad_venta_id ? { ...i, cantidad: i.cantidad + 1 } : i,
        )
      }
      return [...prev, { ...item, cantidad: 1 }]
    })
  }

  function actualizarCantidad(unidadVentaId, cantidad) {
    setItems((prev) =>
      prev.map((i) => (i.unidad_venta_id === unidadVentaId ? { ...i, cantidad } : i)),
    )
  }

  function quitarItem(unidadVentaId) {
    setItems((prev) => prev.filter((i) => i.unidad_venta_id !== unidadVentaId))
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
