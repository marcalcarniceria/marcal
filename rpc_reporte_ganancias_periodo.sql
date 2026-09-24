-- =========================================================
-- Reporte 1 (pantalla Reportes, solo dueño): ganancia del período,
-- sumando ventas de mostrador + pedidos online pagados/en curso.
--
-- security definer + chequeo manual de auth_rol() = 'dueño': a
-- diferencia de productos_mas_vendidos (security invoker, cualquier
-- staff logueado la puede llamar), acá el resultado expone margen real
-- (costo vs. precio) -- información que hoy nadie más que el dueño ve en
-- ninguna pantalla. Si un cajero/repartidor pega /reportes en la URL a
-- mano, el router no lo frena (ProtectedRoute solo exige sesión, no
-- rol), así que el guardado tiene que estar acá, no solo en el front.
--
-- detalle_pedidos.costo_unitario_historico es NULL en todo pedido
-- creado ANTES de schema_costo_historico_pedidos_online.sql (no hay
-- forma de reconstruir ese costo retroactivamente) -- esas líneas se
-- excluyen de la ganancia y se cuentan aparte en
-- lineas_pedidos_sin_costo, para que el número grande del reporte no
-- parezca exacto cuando en realidad le falta un pedazo.
-- =========================================================

create or replace function reporte_ganancias_periodo(
  p_sucursal_id uuid,
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ganancia_ventas numeric;
  v_ganancia_pedidos numeric;
  v_lineas_pedidos_sin_costo bigint;
begin
  if auth_rol() <> 'dueño' then
    raise exception 'No autorizado';
  end if;

  select coalesce(sum(
      (dv.precio_unitario_historico - dv.costo_unitario_historico) * dv.cantidad
    ), 0)
    into v_ganancia_ventas
    from detalle_ventas dv
    join ventas v on v.id = dv.venta_id
    where v.sucursal_id = p_sucursal_id
      and v.estado = 'activa'
      and v.fecha_hora::date between p_desde and p_hasta;

  select coalesce(sum(
      (dp.precio_unitario - dp.costo_unitario_historico) * dp.cantidad
    ), 0)
    into v_ganancia_pedidos
    from detalle_pedidos dp
    join pedidos_online po on po.id = dp.pedido_id
    where po.sucursal_id = p_sucursal_id
      and po.estado <> 'cancelado'
      and po.fecha_creacion::date between p_desde and p_hasta
      and dp.costo_unitario_historico is not null;

  select count(*)
    into v_lineas_pedidos_sin_costo
    from detalle_pedidos dp
    join pedidos_online po on po.id = dp.pedido_id
    where po.sucursal_id = p_sucursal_id
      and po.estado <> 'cancelado'
      and po.fecha_creacion::date between p_desde and p_hasta
      and dp.costo_unitario_historico is null;

  return jsonb_build_object(
    'ganancia_ventas', v_ganancia_ventas,
    'ganancia_pedidos', v_ganancia_pedidos,
    'ganancia_total', v_ganancia_ventas + v_ganancia_pedidos,
    'lineas_pedidos_sin_costo', v_lineas_pedidos_sin_costo
  );
end;
$$;

grant execute on function reporte_ganancias_periodo(uuid, date, date) to authenticated;
