-- =========================================================
-- Mermas tipificadas y transformaciones de producto.
--
-- 1) ajustes_stock: columnas nuevas
--    - subtipo: 'ajuste' (manual, lo de siempre) | 'merma' |
--      'transformacion' | 'anulacion'. tipo_movimiento SIGUE siendo
--      'entrada'/'salida': MovimientosStock.jsx y la vista
--      vw_historial_movimientos_stock comparan contra esos dos valores
--      exactos (con 'entrada_transformacion' una entrada se mostraba como
--      "↓ Salida" y quedaba fuera del filtro "Entradas").
--    - costo_unitario_base: costo por unidad base AL MOMENTO del
--      movimiento -> permite valorizar mermas en $ (reporte futuro).
--    - transformacion_id: agrupa las salidas y entradas de una misma
--      transformación.
--
-- 2) registrar_merma(p_producto_id, p_cantidad, p_motivo, p_unidad_id)
--    Egreso de stock con motivo de una lista CERRADA (texto libre no se
--    puede sumar en un reporte). p_cantidad está expresada en la unidad
--    de venta p_unidad_id (ej. 2.5 "Kilo").
--
-- 3) registrar_transformacion(p_origenes, p_destinos)
--    p_origenes / p_destinos: [{ "producto_id", "unidad_venta_id", "cantidad" }]
--    En UNA transacción: descuenta orígenes, suma destinos, y el costo
--    total de los orígenes pasa a los destinos:
--      - se reparte entre destinos en proporción a la cantidad (unidad
--        base) que sale de cada uno;
--      - en cada destino se PROMEDIA con el stock que ya tenía (un lote
--        chico no pisa el costo de todo lo que ya estaba en cámara);
--      - se actualiza costo_vigente de TODAS las unidades de venta del
--        destino (proporcional a su factor) y cada cambio queda en
--        historial_precios (aparece en "Evolución de costos").
--    La pérdida del proceso (5 kg de paleta -> 4,6 kg de picada) NO se
--    registra aparte como merma: queda absorbida en el costo del destino
--    (registrarla también contaría la pérdida dos veces).
--    Si algún origen no tiene costo cargado, el stock se mueve igual
--    pero los costos de los destinos NO se tocan (se avisa en la
--    respuesta) -- mejor no tocar que calcular un costo falso.
--
-- Roles: dueño, carnicero, verdulero (mismo criterio que
-- rpc_registrar_ajuste_stock). Nunca bloquea por stock negativo (mismo
-- criterio): el stock del sistema puede estar desfasado de la cámara.
--
-- Correr completo en el SQL Editor de Supabase. Idempotente.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Columnas
-- ---------------------------------------------------------

alter table ajustes_stock add column if not exists subtipo text not null default 'ajuste';
alter table ajustes_stock add column if not exists costo_unitario_base numeric;
alter table ajustes_stock add column if not exists transformacion_id uuid;

alter table ajustes_stock drop constraint if exists ajustes_stock_subtipo_check;
alter table ajustes_stock
  add constraint ajustes_stock_subtipo_check
  check (subtipo in ('ajuste', 'merma', 'transformacion', 'anulacion'));

-- Por si schema_precios_masivo.sql todavía no se corrió.
alter table historial_precios add column if not exists usuario_id uuid references usuarios(id);

-- ---------------------------------------------------------
-- 2) registrar_merma
-- ---------------------------------------------------------

create or replace function registrar_merma(
  p_producto_id uuid,
  p_cantidad numeric,
  p_motivo text,
  p_unidad_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sucursal uuid;
  v_nombre text;
  v_factor numeric;
  v_costo_unidad numeric;
  v_cantidad_base numeric;
  v_ajuste_id uuid;
begin
  if coalesce(auth_rol(), '') not in ('dueño', 'carnicero', 'verdulero') then
    raise exception 'No tenés permiso para registrar mermas';
  end if;

  if p_motivo is null or p_motivo not in (
    'Merma - Grasa/Limpieza',
    'Merma - Hueso',
    'Merma - Oreo (Pérdida de frío)',
    'Vencimiento/Descomposición',
    'Consumo Interno'
  ) then
    raise exception 'Motivo de merma inválido: %', p_motivo;
  end if;

  if p_cantidad is null or p_cantidad = 'NaN'::numeric or p_cantidad <= 0 or p_cantidad > 10000 then
    raise exception 'La cantidad tiene que ser mayor a cero';
  end if;

  select p.sucursal_id, p.nombre, uvp.factor_conversion_base, uvp.costo_vigente
    into v_sucursal, v_nombre, v_factor, v_costo_unidad
    from productos p
    join unidades_venta_producto uvp on uvp.producto_id = p.id
    where p.id = p_producto_id
      and uvp.id = p_unidad_id
    for update of p;

  if v_sucursal is null then
    raise exception 'El producto o la unidad no existen (o la unidad no es de ese producto)';
  end if;

  if auth_rol() <> 'dueño' and v_sucursal <> auth_sucursal() then
    raise exception 'No tenés permiso sobre ese producto';
  end if;

  v_cantidad_base := p_cantidad * v_factor;

  insert into ajustes_stock (
    sucursal_id, producto_id, usuario_id, tipo_movimiento, cantidad, motivo,
    subtipo, costo_unitario_base
  ) values (
    v_sucursal, p_producto_id, auth.uid(), 'salida', v_cantidad_base, p_motivo,
    'merma', case when v_factor > 0 then v_costo_unidad / v_factor end
  )
  returning id into v_ajuste_id;

  update productos
  set stock_actual_unidad_base = stock_actual_unidad_base - v_cantidad_base
  where id = p_producto_id;

  return v_ajuste_id;
end;
$$;

revoke execute on function registrar_merma(uuid, numeric, text, uuid) from public, anon;
grant execute on function registrar_merma(uuid, numeric, text, uuid) to authenticated;

-- ---------------------------------------------------------
-- 3) registrar_transformacion
-- Devuelve: { transformacion_id, costo_total, costos_actualizados }
-- ---------------------------------------------------------

create or replace function registrar_transformacion(p_origenes jsonb, p_destinos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transformacion_id uuid := gen_random_uuid();
  v_sucursal uuid;
  v_costo_total numeric := 0;
  v_costo_conocido boolean := true;
  v_base_destinos numeric := 0;
  v_motivo text;
  r record;
  v_stock_previo numeric;
  v_costo_base_actual numeric;
  v_costo_base_nuevo numeric;
  v_costo_lote numeric;
  u record;
begin
  if coalesce(auth_rol(), '') not in ('dueño', 'carnicero', 'verdulero') then
    raise exception 'No tenés permiso para registrar transformaciones';
  end if;

  if p_origenes is null or jsonb_typeof(p_origenes) <> 'array' or jsonb_array_length(p_origenes) = 0 then
    raise exception 'Falta al menos un producto de origen';
  end if;
  if p_destinos is null or jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) = 0 then
    raise exception 'Falta al menos un producto de destino';
  end if;
  if jsonb_array_length(p_origenes) + jsonb_array_length(p_destinos) > 50 then
    raise exception 'Demasiadas líneas en una sola transformación';
  end if;

  -- Normalización: una fila por línea, con su unidad validada contra el
  -- producto y la cantidad pasada a unidad base. (drop previo: por si la
  -- función se llama dos veces dentro de la misma transacción.)
  drop table if exists _tf_lineas;
  create temporary table _tf_lineas on commit drop as
  select
    l.rol,
    (l.item->>'producto_id')::uuid      as producto_id,
    (l.item->>'unidad_venta_id')::uuid  as unidad_venta_id,
    (l.item->>'cantidad')::numeric      as cantidad,
    null::numeric as factor,
    null::numeric as costo_unidad,
    null::numeric as cantidad_base,
    null::uuid    as sucursal_id,
    null::text    as producto_nombre,
    null::text    as unidad_nombre
  from (
    select 'origen'::text as rol, e as item from jsonb_array_elements(p_origenes) e
    union all
    select 'destino'::text, e from jsonb_array_elements(p_destinos) e
  ) l;

  if exists (
    select 1 from _tf_lineas
    where producto_id is null or unidad_venta_id is null or cantidad is null
       or cantidad = 'NaN'::numeric or cantidad <= 0 or cantidad > 10000
  ) then
    raise exception 'Cada línea necesita producto, unidad y una cantidad mayor a cero';
  end if;

  update _tf_lineas t
  set factor = uvp.factor_conversion_base,
      costo_unidad = uvp.costo_vigente,
      cantidad_base = t.cantidad * uvp.factor_conversion_base,
      sucursal_id = p.sucursal_id,
      producto_nombre = p.nombre,
      unidad_nombre = uvp.nombre_unidad
  from unidades_venta_producto uvp
  join productos p on p.id = uvp.producto_id
  where uvp.id = t.unidad_venta_id
    and p.id = t.producto_id;

  if exists (select 1 from _tf_lineas where sucursal_id is null) then
    raise exception 'Hay un producto o unidad que no existe (o la unidad no es de ese producto)';
  end if;

  if (select count(distinct sucursal_id) from _tf_lineas) > 1 then
    raise exception 'Todos los productos tienen que ser de la misma sucursal';
  end if;
  select sucursal_id into v_sucursal from _tf_lineas limit 1;

  if auth_rol() <> 'dueño' and v_sucursal <> auth_sucursal() then
    raise exception 'No tenés permiso sobre esos productos';
  end if;

  -- Un mismo producto no puede ser origen y destino, ni repetirse como
  -- destino (el costo promedio se calcula una vez por producto).
  if exists (
    select 1 from _tf_lineas o join _tf_lineas d on d.producto_id = o.producto_id
    where o.rol = 'origen' and d.rol = 'destino'
  ) then
    raise exception 'Un producto no puede ser origen y destino a la vez';
  end if;
  if exists (
    select producto_id from _tf_lineas where rol = 'destino'
    group by producto_id having count(*) > 1
  ) then
    raise exception 'Un producto destino está repetido: cargalo en una sola línea';
  end if;

  -- Locks en orden de id (mismo criterio que registrar_venta).
  perform 1 from productos
    where id in (select producto_id from _tf_lineas)
    order by id
    for update;

  -- Costo total de los orígenes (a costo vigente de la unidad usada).
  select coalesce(sum(cantidad * costo_unidad), 0), bool_and(costo_unidad is not null)
    into v_costo_total, v_costo_conocido
    from _tf_lineas where rol = 'origen';

  select sum(cantidad_base) into v_base_destinos from _tf_lineas where rol = 'destino';

  v_motivo := 'Transformación: '
    || (select string_agg(cantidad::text || ' ' || unidad_nombre || ' ' || producto_nombre, ' + ')
          from _tf_lineas where rol = 'origen')
    || ' → '
    || (select string_agg(cantidad::text || ' ' || unidad_nombre || ' ' || producto_nombre, ' + ')
          from _tf_lineas where rol = 'destino');
  v_motivo := left(v_motivo, 500);

  -- Salidas (orígenes)
  for r in select * from _tf_lineas where rol = 'origen' loop
    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base - r.cantidad_base
    where id = r.producto_id;

    insert into ajustes_stock (
      sucursal_id, producto_id, usuario_id, tipo_movimiento, cantidad, motivo,
      subtipo, costo_unitario_base, transformacion_id
    ) values (
      v_sucursal, r.producto_id, auth.uid(), 'salida', r.cantidad_base, v_motivo,
      'transformacion', case when r.factor > 0 then r.costo_unidad / r.factor end, v_transformacion_id
    );
  end loop;

  -- Entradas (destinos) + costo heredado
  for r in select * from _tf_lineas where rol = 'destino' loop
    v_costo_base_nuevo := null;

    if v_costo_conocido and v_base_destinos > 0 then
      v_costo_lote := v_costo_total * r.cantidad_base / v_base_destinos;

      -- Promedio ponderado con el stock que ya había (ANTES de sumar el
      -- lote). Sin stock positivo o sin costo previo, el costo es el del lote.
      select stock_actual_unidad_base into v_stock_previo
        from productos where id = r.producto_id;
      v_costo_base_actual := case when r.factor > 0 then r.costo_unidad / r.factor end;

      if coalesce(v_stock_previo, 0) > 0 and v_costo_base_actual is not null then
        v_costo_base_nuevo := (v_stock_previo * v_costo_base_actual + v_costo_lote)
                              / (v_stock_previo + r.cantidad_base);
      else
        v_costo_base_nuevo := v_costo_lote / r.cantidad_base;
      end if;
    end if;

    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base + r.cantidad_base
    where id = r.producto_id;

    insert into ajustes_stock (
      sucursal_id, producto_id, usuario_id, tipo_movimiento, cantidad, motivo,
      subtipo, costo_unitario_base, transformacion_id
    ) values (
      v_sucursal, r.producto_id, auth.uid(), 'entrada', r.cantidad_base, v_motivo,
      'transformacion', v_costo_base_nuevo, v_transformacion_id
    );

    -- Costo nuevo en TODAS las unidades de venta del destino, con
    -- historial (precio de venta sin cambios: es un cambio de COSTO).
    if v_costo_base_nuevo is not null then
      for u in
        select id, costo_vigente, precio_venta, factor_conversion_base
        from unidades_venta_producto
        where producto_id = r.producto_id
        for update
      loop
        if u.costo_vigente is distinct from round(v_costo_base_nuevo * u.factor_conversion_base, 2) then
          insert into historial_precios (
            unidad_venta_id, precio_anterior, precio_nuevo,
            costo_anterior, costo_nuevo, fecha_cambio, usuario_id
          ) values (
            u.id, u.precio_venta, u.precio_venta,
            u.costo_vigente, round(v_costo_base_nuevo * u.factor_conversion_base, 2), now(), auth.uid()
          );

          update unidades_venta_producto
          set costo_vigente = round(v_costo_base_nuevo * u.factor_conversion_base, 2)
          where id = u.id;
        end if;
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'transformacion_id', v_transformacion_id,
    'costo_total', case when v_costo_conocido then round(v_costo_total, 2) end,
    'costos_actualizados', v_costo_conocido
  );
end;
$$;

revoke execute on function registrar_transformacion(jsonb, jsonb) from public, anon;
grant execute on function registrar_transformacion(jsonb, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';
