import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Motivos de merma: lista CERRADA. registrar_merma
// (schema_mermas_transformaciones.sql) valida exactamente los mismos
// textos -- si se agrega uno, hay que agregarlo en los dos lados.
export const MOTIVOS_MERMA = [
  'Merma - Grasa/Limpieza',
  'Merma - Hueso',
  'Merma - Oreo (Pérdida de frío)',
  'Vencimiento/Descomposición',
  'Consumo Interno',
]

// Productos activos con sus unidades de venta, cargados la primera vez que
// se abre un modal de inventario (merma / transformación).
export function useProductosConUnidades(abierto) {
  const [productos, setProductos] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!abierto || productos.length > 0) return
    supabase
      .from('productos')
      .select('id, nombre, unidades_venta_producto(id, nombre_unidad, factor_conversion_base)')
      .eq('activo', true)
      .order('nombre')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setProductos(data ?? [])
      })
  }, [abierto, productos.length])

  return { productos, error }
}
