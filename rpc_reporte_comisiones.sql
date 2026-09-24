-- =========================================================
-- Reporte 6 (pantalla Reportes, solo dueño): comisiones pagadas por
-- método de pago en el período, cruzando pagos_venta (mostrador) +
-- pagos_proveedor con metodos_pago.porcentaje_comision.
--
-- Misma fórmula que ya usa CierreCaja.jsx para el desglose del día:
-- comision_monto = total_movido_con_ese_metodo * porcentaje_comision / 100.
--
-- No incluye pagos_fiados (el pedido original solo menciona
-- pagos_venta/pagos_proveedor) -- si en algún momento también hace
-- falta contemplar comisión al cobrar deuda de fiados, se agrega
-- después como su propia rama del union.
--
-- security definer + auth_rol() = 'dueño', mismo criterio que los
-- reportes anteriores.
-- =========================================================

create or replace function reporte_comisiones(
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
  v_por_metodo jsonb;
  v_total_comision numeric;
begin
  if auth_rol() <> 'dueño' then
    raise exception 'No autorizado';
  end if;

  with mov as (
    select pv.metodo_pago_id, pv.monto
    from pagos_venta pv
    join ventas v on v.id = pv.venta_id
    where v.sucursal_id = p_sucursal_id
      and v.estado = 'activa'
      and v.fecha_hora::date between p_desde and p_hasta

    union all

    select pp.metodo_pago_id, pp.monto
    from pagos_proveedor pp
    where pp.sucursal_id = p_sucursal_id
      and pp.fecha::date between p_desde and p_hasta
  ),
  por_metodo as (
    select
      mp.id as metodo_pago_id,
      mp.nombre as metodo_nombre,
      sum(mov.monto) as total_movido,
      mp.porcentaje_comision,
      sum(mov.monto) * mp.porcentaje_comision / 100 as comision_monto
    from mov
    join metodos_pago mp on mp.id = mov.metodo_pago_id
    group by mp.id, mp.nombre, mp.porcentaje_comision
  )
  select
    coalesce(jsonb_agg(por_metodo order by comision_monto desc), '[]'::jsonb),
    coalesce(sum(comision_monto), 0)
    into v_por_metodo, v_total_comision
    from por_metodo;

  return jsonb_build_object(
    'total_comision', v_total_comision,
    'por_metodo', v_por_metodo
  );
end;
$$;

grant execute on function reporte_comisiones(uuid, date, date) to authenticated;
