-- =========================================================
-- movimientos_dinero_totales: totales de ingresos/egresos para un
-- rango de fechas, calculados con SUM() en el servidor (no trae
-- filas individuales). Hace falta como función aparte porque el
-- query builder de supabase-js no soporta agregados arbitrarios
-- (sum) sobre una vista -- solo count exacto.
--
-- security invoker + la vista movimientos_dinero también es
-- security_invoker (ver schema_movimientos_dinero.sql), así que
-- esta función respeta el mismo RLS de siempre: cada usuario solo
-- suma lo que ya podría ver fila por fila.
--
-- Se llama desde React con:
--   supabase.rpc('movimientos_dinero_totales', {
--     p_sucursal_id: '...',
--     p_desde: '2026-09-01T00:00:00.000Z',
--     p_hasta: '2026-10-01T00:00:00.000Z'
--   })
-- =========================================================

create or replace function movimientos_dinero_totales(
  p_sucursal_id uuid,
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns table (total_ingresos numeric, total_egresos numeric)
language sql
security invoker
stable
as $$
  select
    coalesce(sum(monto) filter (where tipo = 'ingreso'), 0) as total_ingresos,
    coalesce(sum(monto) filter (where tipo = 'egreso'), 0) as total_egresos
  from movimientos_dinero
  where sucursal_id = p_sucursal_id
    and (p_desde is null or fecha >= p_desde)
    and (p_hasta is null or fecha < p_hasta)
$$;

grant execute on function movimientos_dinero_totales(uuid, timestamptz, timestamptz) to authenticated;
