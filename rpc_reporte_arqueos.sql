-- =========================================================
-- Reporte 7 (pantalla Reportes, solo dueño): resumen consolidado de
-- arqueos de caja en el período -- "de los últimos N cierres, hubo
-- diferencia en X de ellos".
--
-- Se apoya en la vista historial_cierres_caja (schema_historial_cierres_caja.sql),
-- que ya calcula "diferencia" con la misma fórmula que usa el
-- formulario de Cierre de Caja -- no se reimplementa la cuenta acá,
-- para no tener dos fórmulas del mismo número.
--
-- security definer + auth_rol() = 'dueño', mismo criterio que los
-- reportes anteriores.
-- =========================================================

create or replace function reporte_arqueos(
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
  v_total_cierres int;
  v_con_diferencia int;
  v_detalle jsonb;
begin
  if auth_rol() <> 'dueño' then
    raise exception 'No autorizado';
  end if;

  select count(*), count(*) filter (where abs(diferencia) > 0.01)
    into v_total_cierres, v_con_diferencia
    from historial_cierres_caja
    where sucursal_id = p_sucursal_id
      and fecha between p_desde and p_hasta;

  select coalesce(jsonb_agg(x order by x.fecha desc), '[]'::jsonb)
    into v_detalle
    from (
      select fecha, diferencia
      from historial_cierres_caja
      where sucursal_id = p_sucursal_id
        and fecha between p_desde and p_hasta
        and abs(diferencia) > 0.01
      order by fecha desc
      limit 10
    ) x;

  return jsonb_build_object(
    'total_cierres', v_total_cierres,
    'con_diferencia', v_con_diferencia,
    'detalle_diferencias', v_detalle
  );
end;
$$;

grant execute on function reporte_arqueos(uuid, date, date) to authenticated;
