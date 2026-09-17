-- =========================================================
-- Tablas nuevas para e-commerce (no existían).
-- =========================================================

create table zonas_envio (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references sucursales(id),
  nombre text not null,
  costo_envio numeric not null default 0,
  activa boolean not null default true
);

create table pedidos_online (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references sucursales(id),
  zona_envio_id uuid not null references zonas_envio(id),
  cliente_nombre text not null,
  cliente_telefono text not null,
  direccion_envio text not null,
  notas text,
  subtotal_productos numeric not null,
  costo_envio numeric not null,
  total numeric not null,
  estado text not null default 'pendiente_pago'
    check (estado in ('pendiente_pago', 'pagado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado')),
  mercadopago_preference_id text,
  mercadopago_payment_id text,
  repartidor_id uuid references usuarios(id),
  fecha_creacion timestamptz not null default now()
);

create table detalle_pedidos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_online(id),
  producto_id uuid not null references productos(id),
  unidad_venta_id uuid not null references unidades_venta_producto(id),
  cantidad numeric not null,
  precio_unitario numeric not null,
  subtotal numeric not null
);

-- =========================================================
-- RLS
-- =========================================================

-- zonas_envio: público puede leerlas (las necesita el checkout sin login)
alter table zonas_envio enable row level security;

drop policy if exists "zonas_envio_select_publico" on zonas_envio;
create policy "zonas_envio_select_publico"
on zonas_envio
for select
to anon, authenticated
using (activa = true);

drop policy if exists "zonas_envio_select_dueno_todas" on zonas_envio;
create policy "zonas_envio_select_dueno_todas"
on zonas_envio
for select
using (auth_rol() = 'dueño');

drop policy if exists "zonas_envio_write_dueno" on zonas_envio;
create policy "zonas_envio_write_dueno"
on zonas_envio
for all
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

-- productos / unidades_venta_producto: sumar lectura pública para el catálogo
-- (las policies ya existentes para el staff logueado se mantienen igual)
drop policy if exists "productos_select_publico" on productos;
create policy "productos_select_publico"
on productos
for select
to anon
using (true);

drop policy if exists "unidades_venta_select_publico" on unidades_venta_producto;
create policy "unidades_venta_select_publico"
on unidades_venta_producto
for select
to anon
using (true);

-- pedidos_online: nadie lee/escribe directo desde el cliente (ni anon ni
-- authenticated común) — todo pasa por las funciones RPC de abajo, que
-- son SECURITY DEFINER y bypasean RLS. Dueño y repartidor sí pueden
-- leer/gestionar desde las pantallas de staff.
alter table pedidos_online enable row level security;

drop policy if exists "pedidos_online_select_staff" on pedidos_online;
create policy "pedidos_online_select_staff"
on pedidos_online
for select
using (
  auth_rol() = 'dueño'
  or (auth_rol() = 'repartidor' and repartidor_id = auth.uid())
);

drop policy if exists "pedidos_online_update_dueno" on pedidos_online;
create policy "pedidos_online_update_dueno"
on pedidos_online
for update
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

drop policy if exists "pedidos_online_update_repartidor" on pedidos_online;
create policy "pedidos_online_update_repartidor"
on pedidos_online
for update
using (auth_rol() = 'repartidor' and repartidor_id = auth.uid())
with check (auth_rol() = 'repartidor' and repartidor_id = auth.uid());

alter table detalle_pedidos enable row level security;

drop policy if exists "detalle_pedidos_select_staff" on detalle_pedidos;
create policy "detalle_pedidos_select_staff"
on detalle_pedidos
for select
using (
  pedido_id in (
    select id from pedidos_online
    where auth_rol() = 'dueño'
       or (auth_rol() = 'repartidor' and repartidor_id = auth.uid())
  )
);

-- =========================================================
-- crear_pedido_online: la usa el checkout público (sin login).
-- Valida todo server-side y NO confía en precios mandados desde
-- el navegador. No descuenta stock todavía (eso pasa al confirmar
-- el pago, ver marcar_pedido_pagado).
-- =========================================================

create or replace function crear_pedido_online(
  p_sucursal_id uuid,
  p_zona_envio_id uuid,
  p_cliente_nombre text,
  p_cliente_telefono text,
  p_direccion_envio text,
  p_notas text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_item jsonb;
  v_producto_sucursal uuid;
  v_precio numeric;
  v_stock numeric;
  v_factor numeric;
  v_subtotal numeric;
  v_subtotal_productos numeric := 0;
  v_costo_envio numeric;
  v_total numeric;
begin
  if p_sucursal_id is null then
    raise exception 'Falta la sucursal';
  end if;

  if p_cliente_nombre is null or trim(p_cliente_nombre) = '' then
    raise exception 'Falta el nombre del cliente';
  end if;

  if p_cliente_telefono is null or trim(p_cliente_telefono) = '' then
    raise exception 'Falta el teléfono del cliente';
  end if;

  if p_direccion_envio is null or trim(p_direccion_envio) = '' then
    raise exception 'Falta la dirección de envío';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido necesita al menos un item';
  end if;

  select costo_envio into v_costo_envio
    from zonas_envio
    where id = p_zona_envio_id and sucursal_id = p_sucursal_id and activa = true;

  if v_costo_envio is null then
    raise exception 'La zona de envío no existe o no pertenece a esta sucursal';
  end if;

  insert into pedidos_online (
    sucursal_id, zona_envio_id, cliente_nombre, cliente_telefono,
    direccion_envio, notas, subtotal_productos, costo_envio, total, estado
  ) values (
    p_sucursal_id, p_zona_envio_id, trim(p_cliente_nombre), trim(p_cliente_telefono),
    trim(p_direccion_envio), nullif(trim(coalesce(p_notas, '')), ''), 0, v_costo_envio, 0, 'pendiente_pago'
  )
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select p.sucursal_id, uvp.precio_venta, uvp.factor_conversion_base, p.stock_actual_unidad_base
      into v_producto_sucursal, v_precio, v_factor, v_stock
      from productos p
      join unidades_venta_producto uvp on uvp.id = (v_item->>'unidad_venta_id')::uuid
      where p.id = (v_item->>'producto_id')::uuid;

    if v_producto_sucursal is null then
      raise exception 'Producto % o unidad % no existe', v_item->>'producto_id', v_item->>'unidad_venta_id';
    end if;

    if v_producto_sucursal <> p_sucursal_id then
      raise exception 'Producto % no pertenece a esta sucursal', v_item->>'producto_id';
    end if;

    if v_stock < (v_item->>'cantidad')::numeric * v_factor then
      raise exception 'No hay stock suficiente para el producto %', v_item->>'producto_id';
    end if;

    v_subtotal := (v_item->>'cantidad')::numeric * v_precio;
    v_subtotal_productos := v_subtotal_productos + v_subtotal;

    insert into detalle_pedidos (
      pedido_id, producto_id, unidad_venta_id, cantidad, precio_unitario, subtotal
    ) values (
      v_pedido_id, (v_item->>'producto_id')::uuid, (v_item->>'unidad_venta_id')::uuid,
      (v_item->>'cantidad')::numeric, v_precio, v_subtotal
    );
  end loop;

  v_total := v_subtotal_productos + v_costo_envio;

  update pedidos_online
  set subtotal_productos = v_subtotal_productos,
      total = v_total
  where id = v_pedido_id;

  return jsonb_build_object('pedido_id', v_pedido_id, 'total', v_total);
end;
$$;

grant execute on function crear_pedido_online(uuid, uuid, text, text, text, text, jsonb) to anon, authenticated;

-- =========================================================
-- Trigger de blindaje: descuenta el stock SIEMPRE que un pedido
-- pase de 'pendiente_pago' a 'pagado', sin importar si el UPDATE
-- vino de marcar_pedido_pagado, de un futuro webhook de Mercado
-- Pago, o de un UPDATE manual por SQL/RLS directo. Antes esto
-- solo lo hacía marcar_pedido_pagado, así que cualquier otro
-- camino para cambiar el estado se saltaba el descuento de stock.
-- =========================================================

create or replace function trg_descontar_stock_pedido_online()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detalle record;
begin
  if OLD.estado = 'pendiente_pago' and NEW.estado = 'pagado' then
    for v_detalle in
      select producto_id, cantidad, unidad_venta_id
      from detalle_pedidos
      where pedido_id = NEW.id
    loop
      update productos
      set stock_actual_unidad_base = stock_actual_unidad_base - v_detalle.cantidad * (
        select factor_conversion_base from unidades_venta_producto where id = v_detalle.unidad_venta_id
      )
      where id = v_detalle.producto_id;
    end loop;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_pedidos_online_descontar_stock on pedidos_online;
create trigger trg_pedidos_online_descontar_stock
after update on pedidos_online
for each row
execute function trg_descontar_stock_pedido_online();

-- =========================================================
-- marcar_pedido_pagado: puente manual hasta que exista el webhook
-- real de Mercado Pago. Solo dueño por ahora. Ya NO descuenta
-- stock acá directamente (lo garantiza el trigger de arriba) —
-- una sola fuente de verdad, así no hay que tocar esta función
-- el día que se agregue el webhook real.
-- =========================================================

create or replace function marcar_pedido_pagado(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if auth_rol() <> 'dueño' then
    raise exception 'Solo el dueño puede confirmar pagos manualmente';
  end if;

  select estado into v_estado from pedidos_online where id = p_pedido_id;

  if v_estado is null then
    raise exception 'El pedido no existe';
  end if;

  if v_estado <> 'pendiente_pago' then
    raise exception 'El pedido ya no está pendiente de pago (estado actual: %)', v_estado;
  end if;

  update pedidos_online set estado = 'pagado' where id = p_pedido_id;
end;
$$;

grant execute on function marcar_pedido_pagado(uuid) to authenticated;
