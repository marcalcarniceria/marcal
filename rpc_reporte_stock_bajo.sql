-- =========================================================
-- Reporte 8 (pantalla Reportes, solo dueño): stock bajo + sugerencia de
-- compra. Mismo cálculo de "stock bajo" que ya usa Productos.jsx
-- (stock_actual_unidad_base < stock_minimo). Como el resto de saldos en
-- tiempo real de esta pantalla, NO usa el rango de fechas de arriba.
--
-- "Proveedor habitual" (limitación, avisada de antemano en el pedido
-- original): no existe ninguna tabla `plantillas_compra` ni relación
-- guardada producto->proveedor en todo el esquema -- se buscó y no está.
-- En vez de dejar el cruce vacío, se infiere el proveedor sugerido como
-- "el que vendió este producto por última vez" (última compra
-- CONFIRMADA que incluye ese producto, sea cual sea el proveedor). Es
-- una inferencia a partir del historial de compras, no un dato
-- guardado como "habitual" -- puede no reflejar la intención real del
-- dueño (ej. si compra el mismo producto a dos proveedores alternando).
-- Si un producto nunca se compró, proveedor_sugerido queda null y el
-- frontend lo muestra sin sugerencia en vez de ocultarlo.
--
-- security definer + auth_rol() = 'dueño', mismo criterio que los
-- reportes anteriores.
-- =========================================================

create or replace function reporte_stock_bajo(p_sucursal_id uuid)
returns table (
  producto_id uuid,
  producto_nombre text,
  stock_actual numeric,
  stock_minimo numeric,
  faltante numeric,
  proveedor_sugerido text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_rol() <> 'dueño' then
    raise exception 'No autorizado';
  end if;

  return query
  select
    p.id as producto_id,
    p.nombre as producto_nombre,
    p.stock_actual_unidad_base as stock_actual,
    p.stock_minimo as stock_minimo,
    p.stock_minimo - p.stock_actual_unidad_base as faltante,
    pr.nombre as proveedor_sugerido
  from productos p
  left join lateral (
    select cp.proveedor_id
    from detalle_compras dc
    join compras_proveedor cp on cp.id = dc.compra_id
    where dc.producto_id = p.id
      and cp.sucursal_id = p_sucursal_id
      and cp.estado = 'confirmada'
    order by cp.fecha desc
    limit 1
  ) ultima on true
  left join proveedores pr on pr.id = ultima.proveedor_id
  where p.sucursal_id = p_sucursal_id
    and p.activo = true
    and p.stock_actual_unidad_base < p.stock_minimo
  order by faltante desc;
end;
$$;

grant execute on function reporte_stock_bajo(uuid) to authenticated;
