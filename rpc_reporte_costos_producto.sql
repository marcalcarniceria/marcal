-- =========================================================
-- Reporte 4 (pantalla Reportes, solo dueño): evolución de costos por
-- producto en el período -- originalmente pensado "por proveedor", pero
-- historial_precios no guarda proveedor_id ni compra_id en ninguna de
-- sus versiones (ver confirmar_pedido_compra y las anteriores) -- solo
-- unidad_venta_id, costo_anterior/nuevo y fecha_cambio. No hay forma de
-- saber qué proveedor causó un cambio de costo dado, así que el reporte
-- queda agrupado por producto (decisión confirmada con el dueño).
--
-- Devuelve los productos con más cambios de costo en el período,
-- ordenados primero por cantidad de cambios y después por variación
-- absoluta -- costo_inicial es el costo_anterior del cambio más viejo
-- del período, costo_final el costo_nuevo del más nuevo (si hubo un
-- solo cambio, es simplemente "de X a Y").
--
-- security definer + auth_rol() = 'dueño', mismo criterio que los
-- reportes anteriores.
-- =========================================================

create or replace function reporte_costos_producto(
  p_sucursal_id uuid,
  p_desde date,
  p_hasta date
)
returns table (
  producto_id uuid,
  producto_nombre text,
  unidad_nombre text,
  costo_inicial numeric,
  costo_final numeric,
  cantidad_cambios bigint
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
    uvp.nombre_unidad as unidad_nombre,
    (array_agg(hp.costo_anterior order by hp.fecha_cambio asc))[1] as costo_inicial,
    (array_agg(hp.costo_nuevo order by hp.fecha_cambio desc))[1] as costo_final,
    count(*) as cantidad_cambios
  from historial_precios hp
  join unidades_venta_producto uvp on uvp.id = hp.unidad_venta_id
  join productos p on p.id = uvp.producto_id
  where p.sucursal_id = p_sucursal_id
    and hp.fecha_cambio::date between p_desde and p_hasta
  group by p.id, p.nombre, uvp.id, uvp.nombre_unidad
  order by cantidad_cambios desc, abs(
    (array_agg(hp.costo_nuevo order by hp.fecha_cambio desc))[1]
    - (array_agg(hp.costo_anterior order by hp.fecha_cambio asc))[1]
  ) desc
  limit 10;
end;
$$;

grant execute on function reporte_costos_producto(uuid, date, date) to authenticated;
