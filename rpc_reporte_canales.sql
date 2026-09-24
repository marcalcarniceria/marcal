-- =========================================================
-- Reporte 3 (pantalla Reportes, solo dueño): mostrador vs. tienda
-- online, por total facturado en el período.
--
-- "Pagado" en pedidos_online se define SOLO por fecha_pago is not null
-- (nunca por estado) -- mismo criterio que ya usa movimientos_dinero
-- (schema_metodo_pago_entrega_cobro.sql) desde que se separó "estado"
-- (etapa del pedido) de "pagado" (cobro real). Se filtra también
-- estado <> 'cancelado' por las dudas (un pedido cancelado después de
-- cobrado no debería contar como facturación).
--
-- Fecha de referencia: fecha_pago para online (cuándo entró la plata,
-- no cuándo se hizo el pedido) y fecha_hora para mostrador (ahí
-- coinciden pedido y cobro).
--
-- security definer + auth_rol() = 'dueño', mismo criterio que los
-- reportes anteriores.
-- =========================================================

create or replace function reporte_canales(
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
  v_total_mostrador numeric;
  v_total_online numeric;
begin
  if auth_rol() <> 'dueño' then
    raise exception 'No autorizado';
  end if;

  select coalesce(sum(v.total_neto), 0)
    into v_total_mostrador
    from ventas v
    where v.sucursal_id = p_sucursal_id
      and v.estado = 'activa'
      and v.fecha_hora::date between p_desde and p_hasta;

  select coalesce(sum(po.total), 0)
    into v_total_online
    from pedidos_online po
    where po.sucursal_id = p_sucursal_id
      and po.estado <> 'cancelado'
      and po.fecha_pago is not null
      and po.fecha_pago::date between p_desde and p_hasta;

  return jsonb_build_object(
    'total_mostrador', v_total_mostrador,
    'total_online', v_total_online
  );
end;
$$;

grant execute on function reporte_canales(uuid, date, date) to authenticated;
