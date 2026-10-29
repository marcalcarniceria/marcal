-- =========================================================
-- Actualización masiva de precios de venta.
--
-- 1) historial_precios.usuario_id: quién hizo cada cambio (las filas
--    viejas y las de compras quedan en null).
-- 2) RPC actualizar_precios_masivo(p_cambios jsonb): actualiza
--    unidades_venta_producto.precio_venta de muchas unidades en UNA
--    transacción (o se aplican todos los cambios o ninguno) y deja una
--    fila en historial_precios por cada unidad que realmente cambió.
-- 3) reporte_costos_producto: contaba CADA fila de historial_precios
--    como "cambio de costo" -- con este módulo, un aumento de 200
--    productos habría aparecido como 200 cambios de costo con el costo
--    igual. Ahora solo cuenta filas donde el costo cambió.
--    Además vuelve a fijar la zona horaria de la función: un
--    CREATE OR REPLACE reemplaza los SET de la función, así que el
--    `alter function ... set timezone` de schema_reportes_zona_horaria.sql
--    se perdería si no se repite acá.
--
-- Solo cambia precio_venta. precio_promocional NO se toca: si una unidad
-- está en oferta, se sigue cobrando la oferta hasta que el dueño la
-- edite (la pantalla lo avisa).
--
-- Correr completo en el SQL Editor de Supabase. Idempotente.
-- =========================================================

begin;

alter table historial_precios add column if not exists usuario_id uuid references usuarios(id);

-- ---------------------------------------------------------
-- 2) RPC
--
-- p_cambios: [{ "unidad_venta_id": "uuid", "precio_nuevo": 5100 }, ...]
-- Devuelve cuántas unidades se actualizaron (las que traían el mismo
-- precio que ya tenían se saltean sin error).
-- ---------------------------------------------------------

create or replace function actualizar_precios_masivo(p_cambios jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_unidad_id uuid;
  v_precio_nuevo numeric;
  v_precio_actual numeric;
  v_costo numeric;
  v_actualizadas integer := 0;
begin
  -- Solo el dueño (no existe rol "encargado"; mismo criterio que la
  -- policy unidades_venta_write_dueno). coalesce: defensa por si se
  -- ejecuta en una base sin security_fix_criticos.sql.
  if coalesce(auth_rol(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede actualizar precios';
  end if;

  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' or jsonb_array_length(p_cambios) = 0 then
    raise exception 'No hay cambios para aplicar';
  end if;

  if jsonb_array_length(p_cambios) > 2000 then
    raise exception 'Demasiados cambios en una sola operación (máximo 2000)';
  end if;

  -- Orden por id: si dos actualizaciones corren a la vez, toman los
  -- locks de las filas en el mismo orden y no se bloquean entre sí.
  for v_item in
    select e from jsonb_array_elements(p_cambios) e
    order by e->>'unidad_venta_id'
  loop
    begin
      v_unidad_id := (v_item->>'unidad_venta_id')::uuid;
      v_precio_nuevo := round((v_item->>'precio_nuevo')::numeric, 2);
    exception when others then
      raise exception 'Cambio inválido: %', v_item;
    end;

    if v_unidad_id is null then
      raise exception 'Falta unidad_venta_id en: %', v_item;
    end if;

    -- NaN es un numeric válido en Postgres (y NaN > cualquier número).
    if v_precio_nuevo is null or v_precio_nuevo = 'NaN'::numeric
       or v_precio_nuevo <= 0 or v_precio_nuevo > 100000000 then
      raise exception 'Precio inválido para la unidad %: %', v_unidad_id, v_item->>'precio_nuevo';
    end if;

    select uvp.precio_venta, uvp.costo_vigente
      into v_precio_actual, v_costo
      from unidades_venta_producto uvp
      where uvp.id = v_unidad_id
      for update;

    if not found then
      raise exception 'La unidad de venta % no existe', v_unidad_id;
    end if;

    -- Mismo precio: no se toca ni se ensucia el historial.
    if v_precio_actual = v_precio_nuevo then
      continue;
    end if;

    update unidades_venta_producto
    set precio_venta = v_precio_nuevo
    where id = v_unidad_id;

    -- Costo sin cambios (anterior = nuevo): es un cambio de PRECIO.
    insert into historial_precios (
      unidad_venta_id, precio_anterior, precio_nuevo,
      costo_anterior, costo_nuevo, fecha_cambio, usuario_id
    ) values (
      v_unidad_id, v_precio_actual, v_precio_nuevo,
      v_costo, v_costo, now(), auth.uid()
    );

    v_actualizadas := v_actualizadas + 1;
  end loop;

  return v_actualizadas;
end;
$$;

revoke execute on function actualizar_precios_masivo(jsonb) from public, anon;
grant execute on function actualizar_precios_masivo(jsonb) to authenticated;

-- ---------------------------------------------------------
-- 3) reporte_costos_producto -- versión vigente
--    (rpc_reporte_costos_producto.sql) + filtro de costo + timezone.
-- ---------------------------------------------------------

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
set timezone = 'America/Argentina/Cordoba'
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
    -- [precios masivos] solo filas donde cambió el COSTO: un cambio de
    -- precio de venta (costo igual) no es "evolución de costos".
    and hp.costo_nuevo is distinct from hp.costo_anterior
  group by p.id, p.nombre, uvp.id, uvp.nombre_unidad
  order by cantidad_cambios desc, abs(
    (array_agg(hp.costo_nuevo order by hp.fecha_cambio desc))[1]
    - (array_agg(hp.costo_anterior order by hp.fecha_cambio asc))[1]
  ) desc
  limit 10;
end;
$$;

grant execute on function reporte_costos_producto(uuid, date, date) to authenticated;

commit;

notify pgrst, 'reload schema';
