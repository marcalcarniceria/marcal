-- =========================================================
-- Combos (Fase 1: estructura + panel).
--
-- Un combo NO tiene stock propio: es una "receta" de productos físicos.
-- Su disponibilidad se calcula siempre al vuelo a partir del stock de
-- sus ingredientes (mismo criterio que esStockBajo / saldo de fiados:
-- nada derivado se guarda aparte). Al venderse (Fase 2) se descuenta el
-- stock de cada ingrediente, no del combo.
--
-- factor_cantidad está expresado en la unidad de venta elegida: 1.5 de
-- la unidad "Kilo" de "Carne picada" consume
--   1.5 * factor_conversion_base (de esa unidad)
-- del stock_actual_unidad_base del producto -- la misma cuenta que usan
-- registrar_venta / crear_pedido_online.
-- =========================================================

create table if not exists combos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references sucursales(id),
  nombre text not null check (trim(nombre) <> ''),
  descripcion text,
  precio_fijo numeric not null check (precio_fijo > 0),
  imagen_url text,
  activo boolean not null default true
);

create table if not exists combo_ingredientes (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references combos(id) on delete cascade,
  producto_id uuid not null references productos(id),
  unidad_venta_id uuid not null references unidades_venta_producto(id),
  factor_cantidad numeric not null check (factor_cantidad > 0)
);

create index if not exists combo_ingredientes_combo_id_idx on combo_ingredientes (combo_id);

-- =========================================================
-- Blindaje: la unidad de venta tiene que ser del mismo producto (si no,
-- el descuento de stock de la Fase 2 restaría del producto equivocado).
-- Ya lo valida guardar_combo; esto cubre cualquier otro camino.
-- =========================================================

create or replace function trg_validar_combo_ingrediente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from unidades_venta_producto
    where id = NEW.unidad_venta_id and producto_id = NEW.producto_id
  ) then
    raise exception 'La unidad de venta elegida no pertenece al producto del ingrediente';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_combo_ingredientes_validar on combo_ingredientes;
create trigger trg_combo_ingredientes_validar
before insert or update on combo_ingredientes
for each row
execute function trg_validar_combo_ingrediente();

-- =========================================================
-- RLS: mismo criterio que productos -- el staff de la sucursal lee, solo
-- el dueño escribe. La tienda pública NO lee estas tablas directo: pasa
-- por obtener_combos_tienda (SECURITY DEFINER, solo combos activos).
-- =========================================================

alter table combos enable row level security;

drop policy if exists "combos_select" on combos;
create policy "combos_select"
on combos
for select
using (auth_rol() = 'dueño' or sucursal_id = auth_sucursal());

drop policy if exists "combos_write_dueno" on combos;
create policy "combos_write_dueno"
on combos
for all
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

alter table combo_ingredientes enable row level security;

drop policy if exists "combo_ingredientes_select" on combo_ingredientes;
create policy "combo_ingredientes_select"
on combo_ingredientes
for select
using (
  auth_rol() = 'dueño'
  or combo_id in (select id from combos where sucursal_id = auth_sucursal())
);

drop policy if exists "combo_ingredientes_write_dueno" on combo_ingredientes;
create policy "combo_ingredientes_write_dueno"
on combo_ingredientes
for all
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

-- =========================================================
-- guardar_combo: crea (p_combo_id null) o edita un combo junto con TODOS
-- sus ingredientes en una sola transacción -- al editar, los
-- ingredientes se reemplazan enteros (borrar + insertar), así el
-- formulario no tiene que llevar la cuenta de altas/bajas/cambios.
--
-- SECURITY INVOKER: los permisos los pone RLS (solo el dueño escribe).
--
-- Se llama desde React con:
--   supabase.rpc('guardar_combo', {
--     p_combo_id: null,
--     p_sucursal_id: '...',
--     p_nombre: 'Combo Asado',
--     p_descripcion: 'Para 4 personas',
--     p_precio_fijo: 25000,
--     p_imagen_url: 'https://...',
--     p_ingredientes: [
--       { producto_id: '...', unidad_venta_id: '...', factor_cantidad: 1.5 }
--     ]
--   })
-- =========================================================

create or replace function guardar_combo(
  p_combo_id uuid,
  p_sucursal_id uuid,
  p_nombre text,
  p_descripcion text,
  p_precio_fijo numeric,
  p_imagen_url text,
  p_ingredientes jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_combo_id uuid;
  v_elem jsonb;
begin
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'El nombre del combo es obligatorio';
  end if;

  if p_precio_fijo is null or p_precio_fijo <= 0 then
    raise exception 'El precio del combo tiene que ser mayor a cero';
  end if;

  if p_ingredientes is null or jsonb_array_length(p_ingredientes) = 0 then
    raise exception 'El combo necesita al menos un ingrediente';
  end if;

  for v_elem in select * from jsonb_array_elements(p_ingredientes)
  loop
    if not exists (
      select 1
      from unidades_venta_producto uvp
      join productos p on p.id = uvp.producto_id
      where uvp.id = (v_elem->>'unidad_venta_id')::uuid
        and p.id = (v_elem->>'producto_id')::uuid
        and p.sucursal_id = p_sucursal_id
    ) then
      raise exception 'Hay un ingrediente con un producto o unidad de venta inválidos';
    end if;

    if coalesce((v_elem->>'factor_cantidad')::numeric, 0) <= 0 then
      raise exception 'Cada ingrediente necesita una cantidad mayor a cero';
    end if;
  end loop;

  if p_combo_id is null then
    insert into combos (sucursal_id, nombre, descripcion, precio_fijo, imagen_url)
    values (
      p_sucursal_id, trim(p_nombre),
      nullif(trim(coalesce(p_descripcion, '')), ''),
      p_precio_fijo,
      nullif(trim(coalesce(p_imagen_url, '')), '')
    )
    returning id into v_combo_id;
  else
    update combos
    set nombre = trim(p_nombre),
        descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
        precio_fijo = p_precio_fijo,
        imagen_url = nullif(trim(coalesce(p_imagen_url, '')), '')
    where id = p_combo_id and sucursal_id = p_sucursal_id
    returning id into v_combo_id;

    if v_combo_id is null then
      raise exception 'El combo no existe o no tenés permiso para editarlo';
    end if;

    delete from combo_ingredientes where combo_id = v_combo_id;
  end if;

  insert into combo_ingredientes (combo_id, producto_id, unidad_venta_id, factor_cantidad)
  select
    v_combo_id,
    (elem->>'producto_id')::uuid,
    (elem->>'unidad_venta_id')::uuid,
    (elem->>'factor_cantidad')::numeric
  from jsonb_array_elements(p_ingredientes) as elem;

  return v_combo_id;
end;
$$;

grant execute on function guardar_combo(uuid, uuid, text, text, numeric, text, jsonb) to authenticated;

-- =========================================================
-- obtener_combos_tienda: combos activos de la sucursal con su "stock
-- virtual" calculado al vuelo.
--
-- stock_virtual = cuántos combos ENTEROS se pueden armar con el stock
-- actual. El consumo se suma por PRODUCTO (no por renglón): si un combo
-- lleva el mismo producto en dos renglones/unidades, los dos restan del
-- mismo stock. El ingrediente más limitante define el resultado.
--
-- disponible = se puede vender online ahora. Además de stock_virtual >= 1
-- exige que ningún ingrediente esté inactivo ni por debajo de su
-- stock_minimo -- la misma regla que bloquea un producto suelto en la
-- tienda (tienda/stock.js), para que un combo no "saque" por la puerta
-- de atrás algo que el dueño reservó.
--
-- SECURITY DEFINER para que la tienda pública (anon) pueda llamarla sin
-- abrir las tablas de combos a lectura pública; solo devuelve combos
-- activos de la sucursal pedida.
-- =========================================================

create or replace function obtener_combos_tienda(p_sucursal_id uuid)
returns table (
  id uuid,
  nombre text,
  descripcion text,
  precio_fijo numeric,
  imagen_url text,
  stock_virtual integer,
  disponible boolean,
  ingredientes jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with consumo_por_producto as (
    select
      ci.combo_id,
      p.id as producto_id,
      p.activo,
      p.stock_actual_unidad_base as stock,
      p.stock_minimo,
      sum(ci.factor_cantidad * uvp.factor_conversion_base) as consumo
    from combo_ingredientes ci
    join productos p on p.id = ci.producto_id
    join unidades_venta_producto uvp on uvp.id = ci.unidad_venta_id
    group by ci.combo_id, p.id, p.activo, p.stock_actual_unidad_base, p.stock_minimo
  ),
  stock_por_combo as (
    select
      combo_id,
      greatest(min(floor(stock / nullif(consumo, 0))), 0)::integer as stock_virtual,
      bool_and(activo and stock >= coalesce(stock_minimo, 0)) as ingredientes_ok
    from consumo_por_producto
    group by combo_id
  ),
  detalle as (
    select
      ci.combo_id,
      jsonb_agg(
        jsonb_build_object(
          'producto_nombre', p.nombre,
          'unidad_nombre', uvp.nombre_unidad,
          'cantidad', ci.factor_cantidad
        )
        order by p.nombre
      ) as ingredientes
    from combo_ingredientes ci
    join productos p on p.id = ci.producto_id
    join unidades_venta_producto uvp on uvp.id = ci.unidad_venta_id
    group by ci.combo_id
  )
  select
    c.id,
    c.nombre,
    c.descripcion,
    c.precio_fijo,
    c.imagen_url,
    coalesce(s.stock_virtual, 0) as stock_virtual,
    coalesce(s.stock_virtual >= 1 and s.ingredientes_ok, false) as disponible,
    coalesce(d.ingredientes, '[]'::jsonb) as ingredientes
  from combos c
  left join stock_por_combo s on s.combo_id = c.id
  left join detalle d on d.combo_id = c.id
  where c.sucursal_id = p_sucursal_id
    and c.activo = true
  order by c.nombre;
$$;

grant execute on function obtener_combos_tienda(uuid) to anon, authenticated;
