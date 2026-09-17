-- =========================================================
-- Plantillas de despiece: reparten el peso y costo de una
-- compra (ej. media res, cajón de pollo) entre varios productos
-- destino según un % de rendimiento configurado una sola vez,
-- para no tener que cargar cada corte a mano en cada compra.
--
-- NOTA (2026-09-17): NO se agregó columna sucursal_id a estas
-- tablas, a diferencia de lo pedido originalmente. El sistema
-- pasó a ser de una sola sucursal en esta misma sesión (se
-- sacaron todos los selectores de sucursal del frontend), así
-- que esa columna sería redundante -- toda plantilla ya está
-- disponible para la única sucursal que existe. Si en el futuro
-- se vuelve a operar más de una sucursal hay que revisar esto.
-- =========================================================

create table if not exists plantillas_despiece (
  id uuid primary key default gen_random_uuid(),
  nombre text not null
);

create table if not exists plantillas_despiece_detalle (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references plantillas_despiece(id) on delete cascade,
  producto_destino_id uuid not null references productos(id),
  porcentaje_rendimiento numeric(5,2) not null
    check (porcentaje_rendimiento > 0 and porcentaje_rendimiento <= 100)
);

-- =========================================================
-- Trigger de blindaje: la suma de % de rendimiento de una
-- plantilla no puede superar 100% (puede ser menor -- hay
-- mermas/descarte que no se registran como producto). Ya se
-- valida en el RPC de creación y en el formulario, esto cubre
-- cualquier otro camino (insert/update manual, bug futuro).
-- =========================================================

create or replace function trg_validar_porcentaje_plantilla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plantilla_id uuid;
  v_suma numeric;
begin
  v_plantilla_id := coalesce(NEW.plantilla_id, OLD.plantilla_id);

  select coalesce(sum(porcentaje_rendimiento), 0) into v_suma
  from plantillas_despiece_detalle
  where plantilla_id = v_plantilla_id;

  if v_suma > 100 then
    raise exception 'La suma de rendimiento de la plantilla no puede superar 100%% (actual: %)', v_suma;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_plantillas_despiece_detalle_validar on plantillas_despiece_detalle;
create trigger trg_plantillas_despiece_detalle_validar
after insert or update on plantillas_despiece_detalle
for each row
execute function trg_validar_porcentaje_plantilla();

-- =========================================================
-- RLS: dueño, verdulero y carnicero pueden gestionar plantillas;
-- cualquier usuario autenticado puede leerlas (las necesita
-- cualquiera que registre una compra, no solo quien las armó).
-- =========================================================

alter table plantillas_despiece enable row level security;

drop policy if exists "plantillas_despiece_select" on plantillas_despiece;
create policy "plantillas_despiece_select"
on plantillas_despiece
for select
using (auth.role() = 'authenticated');

drop policy if exists "plantillas_despiece_write" on plantillas_despiece;
create policy "plantillas_despiece_write"
on plantillas_despiece
for all
using (auth_rol() in ('dueño', 'verdulero', 'carnicero'))
with check (auth_rol() in ('dueño', 'verdulero', 'carnicero'));

alter table plantillas_despiece_detalle enable row level security;

drop policy if exists "plantillas_despiece_detalle_select" on plantillas_despiece_detalle;
create policy "plantillas_despiece_detalle_select"
on plantillas_despiece_detalle
for select
using (auth.role() = 'authenticated');

drop policy if exists "plantillas_despiece_detalle_write" on plantillas_despiece_detalle;
create policy "plantillas_despiece_detalle_write"
on plantillas_despiece_detalle
for all
using (auth_rol() in ('dueño', 'verdulero', 'carnicero'))
with check (auth_rol() in ('dueño', 'verdulero', 'carnicero'));

-- =========================================================
-- crear_plantilla_despiece: crea la plantilla y sus líneas en
-- una sola transacción atómica, validando que la suma de
-- rendimiento no supere 100% ANTES de escribir nada.
--
-- Se llama desde React con:
--   supabase.rpc('crear_plantilla_despiece', {
--     p_nombre: 'Media Res',
--     p_detalle: [
--       { producto_destino_id: '...', porcentaje_rendimiento: 30 },
--       { producto_destino_id: '...', porcentaje_rendimiento: 15 }
--     ]
--   })
-- =========================================================

create or replace function crear_plantilla_despiece(
  p_nombre text,
  p_detalle jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_plantilla_id uuid;
  v_elem jsonb;
  v_suma numeric := 0;
begin
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'El nombre de la plantilla es obligatorio';
  end if;

  if p_detalle is null or jsonb_array_length(p_detalle) = 0 then
    raise exception 'La plantilla necesita al menos un producto destino';
  end if;

  for v_elem in select * from jsonb_array_elements(p_detalle)
  loop
    v_suma := v_suma + (v_elem->>'porcentaje_rendimiento')::numeric;
  end loop;

  if v_suma > 100 then
    raise exception 'La suma de rendimiento no puede superar 100%% (actual: %)', v_suma;
  end if;

  insert into plantillas_despiece (nombre)
  values (trim(p_nombre))
  returning id into v_plantilla_id;

  insert into plantillas_despiece_detalle (plantilla_id, producto_destino_id, porcentaje_rendimiento)
  select
    v_plantilla_id,
    (elem->>'producto_destino_id')::uuid,
    (elem->>'porcentaje_rendimiento')::numeric
  from jsonb_array_elements(p_detalle) as elem;

  return v_plantilla_id;
end;
$$;

grant execute on function crear_plantilla_despiece(text, jsonb) to authenticated;

-- =========================================================
-- registrar_compra_por_plantilla: como registrar_compra (ver
-- rpc_registrar_compra.sql), pero en vez de recibir un detalle
-- item por item, reparte un peso y costo total entre los
-- productos destino de una plantilla de despiece según su % de
-- rendimiento. Mismas restricciones de permisos que
-- registrar_compra: solo el dueño puede ejecutarla (lo garantiza
-- la policy "compras_proveedor_write_dueno", esta función es
-- SECURITY INVOKER).
--
-- Asume que cada producto destino tiene una unidad_venta_producto
-- con factor_conversion_base = 1 (equivale a "1 kilo" en la
-- unidad base de stock, ver comentario en Productos.jsx) -- si no
-- hay ninguna con factor exactamente 1, usa la más cercana.
-- =========================================================

create or replace function registrar_compra_por_plantilla(
  p_sucursal_id uuid,
  p_proveedor_id uuid,
  p_plantilla_id uuid,
  p_peso_total numeric,
  p_costo_total numeric
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_compra_id uuid;
  v_costo_por_kilo numeric;
  v_detalle record;
  v_cantidad numeric;
  v_subtotal numeric;
  v_monto_total numeric := 0;
  v_unidad_id uuid;
  v_factor numeric;
  v_costo_anterior numeric;
  v_precio_actual numeric;
  v_lineas int;
begin
  if p_sucursal_id is null then
    raise exception 'p_sucursal_id es obligatorio';
  end if;

  if p_proveedor_id is null then
    raise exception 'p_proveedor_id es obligatorio';
  end if;

  if p_plantilla_id is null then
    raise exception 'p_plantilla_id es obligatorio';
  end if;

  if p_peso_total is null or p_peso_total <= 0 then
    raise exception 'El peso total debe ser mayor a cero';
  end if;

  if p_costo_total is null or p_costo_total <= 0 then
    raise exception 'El costo total debe ser mayor a cero';
  end if;

  select count(*) into v_lineas
  from plantillas_despiece_detalle
  where plantilla_id = p_plantilla_id;

  if v_lineas = 0 then
    raise exception 'La plantilla no tiene productos destino cargados';
  end if;

  v_costo_por_kilo := p_costo_total / p_peso_total;

  insert into compras_proveedor (sucursal_id, proveedor_id, fecha, monto_total)
  values (p_sucursal_id, p_proveedor_id, now(), 0)
  returning id into v_compra_id;

  for v_detalle in
    select producto_destino_id, porcentaje_rendimiento
    from plantillas_despiece_detalle
    where plantilla_id = p_plantilla_id
  loop
    v_cantidad := p_peso_total * v_detalle.porcentaje_rendimiento / 100;
    v_subtotal := v_cantidad * v_costo_por_kilo;
    v_monto_total := v_monto_total + v_subtotal;

    select uvp.id, uvp.factor_conversion_base, uvp.costo_vigente, uvp.precio_venta
      into v_unidad_id, v_factor, v_costo_anterior, v_precio_actual
      from unidades_venta_producto uvp
      where uvp.producto_id = v_detalle.producto_destino_id
      order by abs(uvp.factor_conversion_base - 1) asc
      limit 1;

    if v_unidad_id is null then
      raise exception 'El producto destino % no tiene ninguna unidad de venta cargada', v_detalle.producto_destino_id;
    end if;

    insert into detalle_compras (
      compra_id, producto_id, unidad_venta_id, cantidad, costo_unitario, subtotal
    ) values (
      v_compra_id, v_detalle.producto_destino_id, v_unidad_id, v_cantidad, v_costo_por_kilo, v_subtotal
    );

    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base + v_cantidad * v_factor,
        fecha_ultimo_ingreso = current_date
    where id = v_detalle.producto_destino_id;

    if not found then
      raise exception 'Producto destino % no existe', v_detalle.producto_destino_id;
    end if;

    if v_costo_anterior is distinct from v_costo_por_kilo then
      insert into historial_precios (
        unidad_venta_id, precio_anterior, precio_nuevo,
        costo_anterior, costo_nuevo, fecha_cambio
      ) values (
        v_unidad_id, v_precio_actual, v_precio_actual,
        v_costo_anterior, v_costo_por_kilo, now()
      );

      update unidades_venta_producto
      set costo_vigente = v_costo_por_kilo
      where id = v_unidad_id;
    end if;
  end loop;

  update compras_proveedor
  set monto_total = v_monto_total
  where id = v_compra_id;

  return v_compra_id;
end;
$$;

grant execute on function registrar_compra_por_plantilla(uuid, uuid, uuid, numeric, numeric) to authenticated;
