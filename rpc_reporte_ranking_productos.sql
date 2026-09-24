-- =========================================================
-- Reporte 2 (pantalla Reportes, solo dueño): ranking de productos por
-- cantidad movida en el período, sumando ventas de mostrador + pedidos
-- online (no cancelados).
--
-- Devuelve TODOS los productos activos de la sucursal (no solo los que
-- tuvieron movimiento) para que "los 10 con menos movimiento" pueda
-- incluir productos con cantidad_total = 0 -- el frontend corta el top
-- 10 / bottom 10 de esta misma lista, ya ordenada desc.
--
-- Un combo no tiene producto_id propio (es un conjunto) -- se explota a
-- su receta congelada (detalle_ventas_combo_ingredientes /
-- detalle_pedidos_combo_ingredientes) y cada ingrediente suma
-- cantidad * factor_cantidad, exactamente como ya hace
-- vw_historial_movimientos_stock para el historial de stock. Así un
-- combo vendido también mueve el ranking de sus ingredientes.
--
-- Nota (no bloqueante, dejar registrado): cantidad_total suma
-- unidades "crudas" tal cual están cargadas en cada línea -- si un
-- mismo producto se vende en más de una unidad de venta (ej. por Kilo
-- Y por Unidad), esos números se suman igual aunque no sean la misma
-- medida. Es una simplificación aceptable para un ranking a simple
-- vista, pero no es una cantidad normalizada a una sola unidad.
--
-- security definer + auth_rol() = 'dueño', mismo criterio que
-- reporte_ganancias_periodo (el router no filtra por rol, así que el
-- guardado tiene que estar acá).
-- =========================================================

create or replace function reporte_ranking_productos(
  p_sucursal_id uuid,
  p_desde date,
  p_hasta date
)
returns table (
  producto_id uuid,
  producto_nombre text,
  cantidad_total numeric
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
  with movimiento as (
    -- Ventas de mostrador: línea de producto directa
    select dv.producto_id as producto_id, dv.cantidad as cantidad
    from detalle_ventas dv
    join ventas v on v.id = dv.venta_id
    where v.sucursal_id = p_sucursal_id
      and v.estado = 'activa'
      and v.fecha_hora::date between p_desde and p_hasta
      and dv.producto_id is not null

    union all

    -- Ventas de mostrador: ingredientes de combos vendidos (receta congelada)
    select s.producto_id as producto_id, dv.cantidad * s.factor_cantidad as cantidad
    from detalle_ventas dv
    join ventas v on v.id = dv.venta_id
    join detalle_ventas_combo_ingredientes s on s.detalle_venta_id = dv.id
    where v.sucursal_id = p_sucursal_id
      and v.estado = 'activa'
      and v.fecha_hora::date between p_desde and p_hasta

    union all

    -- Pedidos online: línea de producto directa
    select dp.producto_id as producto_id, dp.cantidad as cantidad
    from detalle_pedidos dp
    join pedidos_online po on po.id = dp.pedido_id
    where po.sucursal_id = p_sucursal_id
      and po.estado <> 'cancelado'
      and po.fecha_creacion::date between p_desde and p_hasta
      and dp.producto_id is not null

    union all

    -- Pedidos online: ingredientes de combos pedidos (receta congelada)
    select s.producto_id as producto_id, dp.cantidad * s.factor_cantidad as cantidad
    from detalle_pedidos dp
    join pedidos_online po on po.id = dp.pedido_id
    join detalle_pedidos_combo_ingredientes s on s.detalle_pedido_id = dp.id
    where po.sucursal_id = p_sucursal_id
      and po.estado <> 'cancelado'
      and po.fecha_creacion::date between p_desde and p_hasta
  )
  select
    p.id as producto_id,
    p.nombre as producto_nombre,
    coalesce(sum(m.cantidad), 0) as cantidad_total
  from productos p
  left join movimiento m on m.producto_id = p.id
  where p.sucursal_id = p_sucursal_id
    and p.activo = true
  group by p.id, p.nombre
  order by cantidad_total desc, p.nombre asc;
end;
$$;

grant execute on function reporte_ranking_productos(uuid, date, date) to authenticated;
