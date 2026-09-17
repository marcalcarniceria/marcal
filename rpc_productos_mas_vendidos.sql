-- =========================================================
-- productos_mas_vendidos: catálogo de venta para la pantalla
-- de cajero, ordenado por cuántas veces se vendió cada unidad
-- de venta en los últimos 90 días (ventas activas de la sucursal).
--
-- Devuelve TODAS las unidades de venta de productos activos de
-- la sucursal (no solo un top-N) para que un producto nuevo o
-- poco vendido siga siendo vendible desde la grilla — el frontend
-- decide cuántas mostrar como "más vendidos" y el resto como
-- "otros productos". Los nunca vendidos quedan con ventas_count=0
-- y al final del orden.
--
-- security invoker: solo hace SELECT, así que respeta el RLS que
-- ya filtra productos/ventas por sucursal según el rol logueado
-- (no hace falta duplicar esas validaciones acá).
-- =========================================================

create or replace function productos_mas_vendidos(p_sucursal_id uuid)
returns table (
  producto_id uuid,
  producto_nombre text,
  unidad_venta_id uuid,
  unidad_nombre text,
  precio_venta numeric,
  costo_vigente numeric,
  factor_conversion_base numeric,
  stock_actual_unidad_base numeric,
  ventas_count bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    p.id as producto_id,
    p.nombre as producto_nombre,
    uvp.id as unidad_venta_id,
    uvp.nombre_unidad as unidad_nombre,
    uvp.precio_venta,
    uvp.costo_vigente,
    uvp.factor_conversion_base,
    p.stock_actual_unidad_base,
    coalesce(v.ventas_count, 0) as ventas_count
  from productos p
  join unidades_venta_producto uvp on uvp.producto_id = p.id
  left join (
    select dv.unidad_venta_id, count(*) as ventas_count
    from detalle_ventas dv
    join ventas ve on ve.id = dv.venta_id
    where ve.sucursal_id = p_sucursal_id
      and ve.estado = 'activa'
      and ve.fecha_hora > now() - interval '90 days'
    group by dv.unidad_venta_id
  ) v on v.unidad_venta_id = uvp.id
  where p.sucursal_id = p_sucursal_id
    and p.activo = true
  order by ventas_count desc, p.nombre asc, uvp.nombre_unidad asc;
$$;

grant execute on function productos_mas_vendidos(uuid) to authenticated;
