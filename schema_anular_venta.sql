-- =========================================================
-- Anulación de ventas del mostrador.
--
-- Hasta ahora una venta mal cargada quedaba para siempre: ventas no tiene
-- policy de UPDATE (rls_setup_cajero.sql menciona una Edge Function
-- "anular_venta" que nunca se creó).
--
-- Qué revierte anular (y por qué alcanza con cambiar el estado):
--   - Caja / dinero / reportes / fiados: TODO lo que suma plata ya filtra
--     ventas.estado = 'activa' (CierreCaja.jsx, movimientos_dinero,
--     reporte_*, deuda de fiados). Con estado = 'anulada' la venta deja
--     de contar sola, sin tocar esas consultas.
--   - Stock: se devuelve explícitamente, con el MISMO cálculo con que lo
--     descontó registrar_venta (schema_combos_snapshot.sql):
--       producto: cantidad * factor_conversion_base de la unidad
--       combo:    cantidad * sum(factor_cantidad * factor_conversion_base)
--                 de la FOTO de la receta (detalle_ventas_combo_ingredientes),
--                 no de la receta actual.
--     Cada devolución queda como un ajuste 'entrada' en ajustes_stock
--     ("Anulación venta #...: <motivo>"), así el historial de movimientos
--     muestra la salida original Y su reversión.
--
-- Reglas:
--   - Solo el dueño anula (no existe rol "encargado"; un cajero que
--     pudiera anular sus propias ventas en efectivo podría cobrar y
--     quedarse la plata). Para habilitar otro rol, editar el chequeo.
--   - Solo ventas 'activa'.
--   - No se anula una venta de un día con la caja YA CERRADA: cambiaría
--     un arqueo histórico. Para corregir eso, primero hay que reabrir/
--     revisar el cierre (decisión del dueño, fuera de esta función).
--
-- Correr completo en el SQL Editor de Supabase. Idempotente.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Columnas de auditoría de la anulación
-- (anulada_por referencia a usuarios: si algún día se embebe
--  ventas -> usuarios desde PostgREST, hay que nombrar la FK porque
--  pasan a ser dos relaciones: usuario_id y anulada_por.)
-- ---------------------------------------------------------

alter table ventas add column if not exists anulada_por uuid references usuarios(id);
alter table ventas add column if not exists fecha_anulacion timestamptz;
alter table ventas add column if not exists motivo_anulacion text;

-- ---------------------------------------------------------
-- 2) 'anulada' tiene que ser un estado válido.
-- La tabla ventas se creó fuera de estos archivos, así que no se sabe
-- si estado es text con un CHECK o un enum: se contemplan los dos.
-- ---------------------------------------------------------

do $$
declare
  v_tipo text;
  r record;
begin
  select format_type(a.atttypid, a.atttypmod)
    into v_tipo
    from pg_attribute a
    where a.attrelid = 'public.ventas'::regclass and a.attname = 'estado';

  if exists (
    select 1 from pg_type t
    where t.oid = (select atttypid from pg_attribute
                   where attrelid = 'public.ventas'::regclass and attname = 'estado')
      and t.typtype = 'e'
  ) then
    -- enum: se agrega el valor si falta
    execute format('alter type %s add value if not exists %L', v_tipo, 'anulada');
  else
    -- text + CHECK: si hay un CHECK sobre estado que no admite 'anulada',
    -- se reemplaza por uno que admite los dos estados que usa el sistema.
    for r in
      select c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      where c.conrelid = 'public.ventas'::regclass
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%estado%'
    loop
      if r.def not ilike '%anulada%' then
        execute format('alter table ventas drop constraint %I', r.conname);
        raise notice 'Se reemplazó el CHECK % (%)', r.conname, r.def;
      end if;
    end loop;

    if not exists (
      select 1 from pg_constraint c
      where c.conrelid = 'public.ventas'::regclass and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%anulada%'
    ) then
      alter table ventas
        add constraint ventas_estado_check check (estado in ('activa', 'anulada')) not valid;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------
-- 3) RPC anular_venta
-- ---------------------------------------------------------

create or replace function anular_venta(p_venta_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta record;
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_referencia text;
  r record;
begin
  -- Rol: auth_rol() ya nunca devuelve NULL (security_fix_criticos.sql),
  -- el coalesce es solo defensa por si se ejecuta en una base sin ese fix.
  if coalesce(auth_rol(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede anular ventas';
  end if;

  if length(v_motivo) < 3 then
    raise exception 'Escribí el motivo de la anulación';
  end if;
  if length(v_motivo) > 200 then
    raise exception 'El motivo es demasiado largo (máximo 200 caracteres)';
  end if;

  -- FOR UPDATE: dos anulaciones simultáneas de la misma venta no pueden
  -- devolver el stock dos veces -- la segunda espera y ve 'anulada'.
  select id, sucursal_id, estado, fecha_hora
    into v_venta
    from ventas
    where id = p_venta_id
    for update;

  if v_venta.id is null then
    raise exception 'La venta no existe';
  end if;

  if v_venta.estado <> 'activa' then
    raise exception 'La venta ya está anulada';
  end if;

  -- Mismo "día" que usa CierreCaja.jsx: la fecha local de Argentina.
  if exists (
    select 1 from cierres_caja cc
    where cc.sucursal_id = v_venta.sucursal_id
      and cc.fecha = (v_venta.fecha_hora at time zone 'America/Argentina/Cordoba')::date
  ) then
    raise exception 'La caja de ese día ya está cerrada: anular la venta cambiaría un arqueo ya registrado';
  end if;

  v_referencia := 'Anulación venta #' || v_venta.id::text || ': ' || v_motivo;

  -- Stock a devolver por producto (en unidad base), sumando líneas de
  -- producto y de combo. Se bloquean las filas de productos en orden de
  -- id -- mismo criterio que registrar_venta, evita deadlocks con una
  -- venta que se esté registrando en paralelo.
  for r in
    with devolucion as (
      select dv.producto_id, dv.cantidad * uvp.factor_conversion_base as cantidad_base
      from detalle_ventas dv
      join unidades_venta_producto uvp on uvp.id = dv.unidad_venta_id
      where dv.venta_id = v_venta.id
        and dv.producto_id is not null

      union all

      select s.producto_id, dv.cantidad * s.factor_cantidad * s.factor_conversion_base
      from detalle_ventas dv
      join detalle_ventas_combo_ingredientes s on s.detalle_venta_id = dv.id
      where dv.venta_id = v_venta.id
        and dv.combo_id is not null
    )
    select d.producto_id, sum(d.cantidad_base) as cantidad_base
    from devolucion d
    join productos p on p.id = d.producto_id
    group by d.producto_id
    having sum(d.cantidad_base) > 0
    order by d.producto_id
  loop
    perform 1 from productos where id = r.producto_id for update;

    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base + r.cantidad_base
    where id = r.producto_id;

    insert into ajustes_stock (sucursal_id, producto_id, usuario_id, tipo_movimiento, cantidad, motivo)
    values (v_venta.sucursal_id, r.producto_id, auth.uid(), 'entrada', r.cantidad_base, v_referencia);
  end loop;

  update ventas
  set estado = 'anulada',
      anulada_por = auth.uid(),
      fecha_anulacion = now(),
      motivo_anulacion = v_motivo
  where id = v_venta.id;
end;
$$;

revoke execute on function anular_venta(uuid, text) from public, anon;
grant execute on function anular_venta(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';
