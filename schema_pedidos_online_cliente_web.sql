-- =========================================================
-- Vincula pedidos_online con clientes_web (cuando el pedido lo hizo
-- un cliente logueado) para poder implementar "Mis pedidos" en el
-- header de la tienda. Nullable: el checkout de invitado sigue
-- funcionando igual, sin cuenta.
--
-- IMPORTANTE (avisado al usuario): los pedidos hechos ANTES de esta
-- migración quedan con cliente_web_id en null, aunque el cliente que
-- los hizo ya tuviera cuenta en ese momento -- no existía forma de
-- vincularlos entonces (pedidos_online solo guardaba nombre/teléfono
-- como texto libre) y no se puede reconstruir ese vínculo de forma
-- confiable ahora. Esos pedidos viejos no van a aparecer en "Mis
-- pedidos", es esperado.
-- =========================================================

alter table pedidos_online
  add column if not exists cliente_web_id uuid references clientes_web(id);

-- No se tocan/remueven las policies existentes de dueño/repartidor.
drop policy if exists "pedidos_online_select_cliente" on pedidos_online;
create policy "pedidos_online_select_cliente"
on pedidos_online
for select
using (cliente_web_id = auth.uid());

drop policy if exists "detalle_pedidos_select_cliente" on detalle_pedidos;
create policy "detalle_pedidos_select_cliente"
on detalle_pedidos
for select
using (
  pedido_id in (
    select id from pedidos_online where cliente_web_id = auth.uid()
  )
);

-- =========================================================
-- crear_pedido_online: se agrega p_cliente_web_id (nullable, al
-- final para no romper la posición de los parámetros existentes).
-- Se DROPEA la versión de 7 parámetros primero -- si solo se hace
-- CREATE OR REPLACE con un parámetro nuevo, Postgres identifica
-- funciones por nombre + tipos de parámetros, así que agregar uno
-- crea una SEGUNDA función superpuesta en vez de reemplazar la
-- original (quedarían las dos, PostgREST no sabría cuál usar). El
-- resto del cuerpo es idéntico al original en schema_ecommerce.sql,
-- solo cambia el insert de pedidos_online para guardar la columna
-- nueva.
-- =========================================================

drop function if exists crear_pedido_online(uuid, uuid, text, text, text, text, jsonb);

create or replace function crear_pedido_online(
  p_sucursal_id uuid,
  p_zona_envio_id uuid,
  p_cliente_nombre text,
  p_cliente_telefono text,
  p_direccion_envio text,
  p_notas text,
  p_items jsonb,
  p_cliente_web_id uuid default null
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
    direccion_envio, notas, subtotal_productos, costo_envio, total, estado,
    cliente_web_id
  ) values (
    p_sucursal_id, p_zona_envio_id, trim(p_cliente_nombre), trim(p_cliente_telefono),
    trim(p_direccion_envio), nullif(trim(coalesce(p_notas, '')), ''), 0, v_costo_envio, 0, 'pendiente_pago',
    p_cliente_web_id
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

grant execute on function crear_pedido_online(uuid, uuid, text, text, text, text, jsonb, uuid) to anon, authenticated;
