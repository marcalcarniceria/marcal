import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { SUCURSAL_ID } from '../../config/sucursal'
import { esStockBajo } from './stock'

// Extraído de Tienda.jsx tal cual estaba (mismo fetch, mismas
// derivaciones) para que la versión mobile use exactamente los mismos
// datos sin duplicar la lógica.
export function useTiendaCatalogo() {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [combos, setCombos] = useState([])

  useEffect(() => {
    supabase
      .from('productos')
      // catalogo_unidades = unidades sin costo_vigente (ver
      // schema_catalogo_unidades_publico.sql). El alias mantiene el nombre
      // `unidades_venta_producto` que usan ProductoCard y la versión mobile.
      .select('*, unidades_venta_producto:catalogo_unidades(*)')
      .eq('sucursal_id', SUCURSAL_ID)
      .eq('activo', true)
      .then(({ data, error }) => {
        if (error) setError(error)
        else setProductos(data)
        setLoading(false)
      })

    // Combos: stock virtual calculado en la base (schema_combos.sql). Si
    // falla, la tienda sigue andando sin esa sección en vez de romperse.
    supabase
      .rpc('obtener_combos_tienda', { p_sucursal_id: SUCURSAL_ID })
      .then(({ data, error }) => {
        if (error) console.error('[tienda] no se pudieron cargar los combos', error)
        else setCombos(data)
      })
  }, [])

  // Solo los que hoy se pueden armar (stock de todos los ingredientes y
  // ninguno bajo su mínimo), mismo criterio que Promociones.
  const combosDisponibles = combos.filter((c) => c.disponible)

  // Los que ya tienen categoría se muestran dentro de su bloque
  // (Carnicería/Verdulería/Más Productos); acá abajo quedan solo los que
  // todavía no tienen ninguna asignada.
  const sinCategoria = productos.filter((p) => !p.categoria)

  // Promociones no depende de la categoría: entra cualquier producto con al
  // menos una unidad con precio_promocional (ver schema_precio_promocional.sql).
  // Los que están bajo el stock mínimo no entran: en una vidriera de ofertas
  // no suman.
  const enPromocion = productos.filter(
    (p) =>
      !esStockBajo(p) &&
      p.unidades_venta_producto?.some((u) => u.precio_promocional != null),
  )

  return { productos, loading, error, combos, combosDisponibles, sinCategoria, enPromocion }
}
