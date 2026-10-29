-- =========================================================
-- Reportes: fechas en hora argentina, no en UTC.
--
-- Los reporte_* filtran con `fecha_hora::date between p_desde and
-- p_hasta`. Castear un timestamptz a date usa la zona horaria de la
-- SESIÓN, que en Supabase es UTC: una venta del 29/10 a las 22:00 (hora
-- de Córdoba) es el 30/10 01:00 UTC -> el reporte de "Hoy" (29) no la
-- cuenta, y el del 30 sí. Afecta a las ventas de 21:00 a 24:00 de
-- cada día.
--
-- Fix sin reescribir ninguna función: SET timezone a nivel FUNCIÓN. Rige
-- solo mientras corre cada reporte (no cambia la zona de la base, ni de
-- otras consultas, ni el formato en que la API devuelve timestamps).
-- OJO: un `create or replace` de cualquiera de estas funciones BORRA
-- este setting (Postgres reemplaza los SET de la función con los del
-- nuevo create). Si se redefine un reporte, hay que poner
-- `set timezone = 'America/Argentina/Cordoba'` en su definición (como
-- hace schema_precios_masivo.sql con reporte_costos_producto) o volver
-- a correr este archivo.
--
-- Idempotente: se puede correr más de una vez.
-- =========================================================

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'reporte_ganancias_periodo',
        'reporte_canales',
        'reporte_ranking_productos',
        'reporte_costos_producto',
        'reporte_comisiones',
        'reporte_arqueos'
      )
  loop
    execute format('alter function %s set timezone = %L', f.firma, 'America/Argentina/Cordoba');
    raise notice 'zona horaria fijada en %', f.firma;
  end loop;
end;
$$;

-- Verificación: las 6 tienen que aparecer con timezone=America/Argentina/Cordoba
select p.proname, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'reporte\_%'
order by p.proname;
