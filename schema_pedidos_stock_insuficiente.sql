-- =========================================================
-- CAMBIO 1: el pedido ya no se bloquea por falta de stock. Se marca
-- la línea afectada (stock_insuficiente + faltante) y el pedido se
-- crea siempre.
--
-- Aclaración: crear_pedido_online NUNCA descontó stock -- solo
-- validaba y bloqueaba con `raise exception`. El descuento real pasa
-- al marcar el pedido "pagado" (trg_pedidos_online_descontar_stock,
-- sin cambios acá). Este cambio solo saca el bloqueo y deja una
-- advertencia calculada con el stock de HOY; no reserva ni descuenta
-- nada nuevo.
-- =========================================================

alter table detalle_pedidos add column if not exists stock_insuficiente boolean not null default false;
alter table detalle_pedidos add column if not exists faltante numeric(12,3);

-- `faltante` queda expresado en la MISMA unidad que `cantidad` (la
-- unidad de venta que eligió el cliente, ej. "Kilo", "Bolsa"), no en
-- la unidad base interna del stock -- para poder mostrar "Faltan 3 kg"
-- directamente sin tener que hacer otra conversión en el frontend.

-- =========================================================
-- Fix de RLS (mismo bug que la vez pasada, tabla distinta):
-- detalle_pedidos_select_staff nunca se actualizó cuando ampliamos
-- pedidos_online_select_staff a sucursal_id = auth_sucursal(). Sin
-- esto, el cajero ve el pedido pero no sus líneas.
-- =========================================================

drop policy if exists "detalle_pedidos_select_staff" on detalle_pedidos;
create policy "detalle_pedidos_select_staff"
on detalle_pedidos
for select
using (
  pedido_id in (
    select id from pedidos_online
    where auth_rol() = 'dueño'
       or (auth_rol() = 'repartidor' and repartidor_id = auth.uid())
       or sucursal_id = auth_sucursal()
  )
);

-- =========================================================
-- Realtime: detalle_pedidos nunca se agregó a la publicación (en el
-- paso anterior solo se agregó pedidos_online). Hace falta para el
-- toast del Cambio 3.
-- =========================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'detalle_pedidos'
  ) then
    alter publication supabase_realtime add table detalle_pedidos;
  end if;
end $$;

-- =========================================================
-- crear_pedido_online: misma firma de siempre (uuid, uuid, text, text,
-- text, text, jsonb, uuid) -- create or replace alcanza, no hace
-- falta dropear nada.
-- =========================================================

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
  v_cantidad numeric;
  v_subtotal numeric;
  v_subtotal_productos numeric := 0;
  v_costo_envio numeric;
  v_total numeric;
  v_stock_insuficiente boolean;
  v_faltante numeric;
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

    v_cantidad := (v_item->>'cantidad')::numeric;

    -- Ya NO bloquea (antes: raise exception acá). Se marca la línea y
    -- se sigue -- ver nota arriba, esto no descuenta ni reserva nada.
    if v_stock < v_cantidad * v_factor then
      v_stock_insuficiente := true;
      v_faltante := v_cantidad - (v_stock / v_factor);
    else
      v_stock_insuficiente := false;
      v_faltante := null;
    end if;

    v_subtotal := v_cantidad * v_precio;
    v_subtotal_productos := v_subtotal_productos + v_subtotal;

    insert into detalle_pedidos (
      pedido_id, producto_id, unidad_venta_id, cantidad, precio_unitario, subtotal,
      stock_insuficiente, faltante
    ) values (
      v_pedido_id, (v_item->>'producto_id')::uuid, (v_item->>'unidad_venta_id')::uuid,
      v_cantidad, v_precio, v_subtotal,
      v_stock_insuficiente, v_faltante
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
