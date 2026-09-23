-- =========================================================
-- Cambio de fondo: separar "está pagado" de "en qué etapa está".
--
-- Hasta ahora 'pagado' era un ESTADO que se atravesaba siempre en el
-- mismo orden (pendiente_pago -> pagado -> en_preparacion -> ...). Eso
-- deja de ser cierto con efectivo contra entrega: el pedido tiene que
-- poder avanzar por preparación/camino/entregado SIN haber cobrado
-- todavía, y cobrarse recién al final.
--
-- Nuevo criterio: el ESTADO refleja solo la etapa del proceso físico.
-- Si está cobrado o no lo dice ÚNICAMENTE fecha_pago (no null =
-- cobrado), independiente del estado. 'pagado' queda en el check
-- constraint de estado solo por compatibilidad con pedidos históricos
-- que ya lo tienen -- ningún código nuevo lo vuelve a setear.
-- =========================================================

-- =========================================================
-- Limpieza de un experimento que ya estaba vivo en la base (nombres
-- tipo_entrega / metodo_pago_solicitado, con 3 valores de pago
-- incluyendo 'transferencia'), pegado directo en Supabase sin quedar
-- en el repo y sin ningún frontend usándolo todavía -- confirmado con
-- el dueño que se reemplaza por esta versión, no se adapta. También
-- tenía un bug real: exigía zona_envio_id/costo_envio SIEMPRE, sin
-- importar el tipo de entrega, así que 'retiro_local' nunca hubiera
-- funcionado tal como estaba.
-- =========================================================

drop function if exists crear_pedido_online(uuid, uuid, text, text, text, text, jsonb, uuid, text, text);
alter table pedidos_online drop column if exists tipo_entrega;
alter table pedidos_online drop column if exists metodo_pago_solicitado;

alter table pedidos_online
  add column if not exists metodo_pago text not null default 'mercadopago'
    check (metodo_pago in ('mercadopago', 'efectivo'));

alter table pedidos_online
  add column if not exists metodo_entrega text not null default 'envio'
    check (metodo_entrega in ('envio', 'retiro'));

-- Quién cobró en mano (útil para responsabilizar caja/repartidor en
-- pagos en efectivo) -- nullable, se completa recién al cobrar.
alter table pedidos_online
  add column if not exists cobrado_por uuid references usuarios(id);

-- zona_envio_id y direccion_envio eran NOT NULL -- con "retiro en el
-- local" ninguno de los dos aplica.
alter table pedidos_online alter column zona_envio_id drop not null;
alter table pedidos_online alter column direccion_envio drop not null;

-- Consistencia a nivel de base, no solo en crear_pedido_online: un
-- pedido con envío siempre necesita zona y dirección; uno con retiro no
-- los necesita (pero tampoco está prohibido que los tenga, por si se
-- reutiliza un pedido viejo o se cambia de opinión más adelante).
alter table pedidos_online drop constraint if exists pedidos_online_envio_consistente;
alter table pedidos_online
  add constraint pedidos_online_envio_consistente
  check (
    metodo_entrega = 'retiro'
    or (zona_envio_id is not null and direccion_envio is not null)
  );

-- =========================================================
-- crear_pedido_online: se agregan p_metodo_pago/p_metodo_entrega
-- (default 'mercadopago'/'envio', compatible con cualquier llamada
-- vieja que no los mande). p_zona_envio_id y p_direccion_envio pasan a
-- tener default null -- ya no son estrictamente obligatorios, la
-- validación de si hacen falta ahora depende de p_metodo_entrega.
--
-- Todos los parámetros existentes mantienen mismo nombre/tipo/posición
-- -- CREATE OR REPLACE permite tanto agregar un default a un parámetro
-- que no lo tenía como agregar parámetros nuevos al final con default,
-- sin necesidad de dropear la función primero.
-- =========================================================

create or replace function crear_pedido_online(
  p_sucursal_id uuid,
  p_zona_envio_id uuid default null,
  p_cliente_nombre text default null,
  p_cliente_telefono text default null,
  p_direccion_envio text default null,
  p_notas text default null,
  p_items jsonb default null,
  p_cliente_web_id uuid default null,
  p_metodo_pago text default 'mercadopago',
  p_metodo_entrega text default 'envio'
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

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido necesita al menos un item';
  end if;

  if p_metodo_pago not in ('mercadopago', 'efectivo') then
    raise exception 'Método de pago inválido: %', p_metodo_pago;
  end if;

  if p_metodo_entrega not in ('envio', 'retiro') then
    raise exception 'Método de entrega inválido: %', p_metodo_entrega;
  end if;

  if p_metodo_entrega = 'envio' then
    if p_direccion_envio is null or trim(p_direccion_envio) = '' then
      raise exception 'Falta la dirección de envío';
    end if;

    select costo_envio into v_costo_envio
      from zonas_envio
      where id = p_zona_envio_id and sucursal_id = p_sucursal_id and activa = true;

    if v_costo_envio is null then
      raise exception 'La zona de envío no existe o no pertenece a esta sucursal';
    end if;
  else
    -- Retiro en el local: sin costo de envío, sin zona ni dirección.
    v_costo_envio := 0;
    p_zona_envio_id := null;
    p_direccion_envio := null;
  end if;

  insert into pedidos_online (
    sucursal_id, zona_envio_id, cliente_nombre, cliente_telefono,
    direccion_envio, notas, subtotal_productos, costo_envio, total, estado,
    cliente_web_id, metodo_pago, metodo_entrega
  ) values (
    p_sucursal_id, p_zona_envio_id, trim(p_cliente_nombre), trim(p_cliente_telefono),
    nullif(trim(coalesce(p_direccion_envio, '')), ''), nullif(trim(coalesce(p_notas, '')), ''),
    0, v_costo_envio, 0, 'pendiente_pago',
    p_cliente_web_id, p_metodo_pago, p_metodo_entrega
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

grant execute on function crear_pedido_online(uuid, uuid, text, text, text, text, jsonb, uuid, text, text) to anon, authenticated;

-- =========================================================
-- marcar_pedido_cobrado: reemplaza a marcar_pedido_pagado (ver
-- decisión de unificar, punto 4). Cualquier staff de la sucursal (o
-- dueño) puede llamarla -- no es una acción sensible restringida como
-- antes, es un simple "confirmo que entró la plata". Nunca toca estado
-- ni stock. Se puede llamar en cualquier momento del ciclo de vida del
-- pedido, no solo desde 'pendiente_pago'.
--
-- Guard contra doble llamada: si fecha_pago ya está seteada, rechaza
-- -- evita que un doble click pise la fecha real de cobro (importante
-- para que movimientos_dinero muestre el día correcto).
-- =========================================================

create or replace function marcar_pedido_cobrado(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_sucursal_id uuid;
  v_fecha_pago timestamptz;
begin
  select estado, sucursal_id, fecha_pago
    into v_estado, v_sucursal_id, v_fecha_pago
    from pedidos_online where id = p_pedido_id;

  if v_estado is null then
    raise exception 'El pedido no existe';
  end if;

  if not (auth_rol() = 'dueño' or v_sucursal_id = auth_sucursal()) then
    raise exception 'No autorizado';
  end if;

  if v_fecha_pago is not null then
    raise exception 'Este pedido ya está marcado como cobrado';
  end if;

  update pedidos_online
  set fecha_pago = now(), cobrado_por = auth.uid()
  where id = p_pedido_id;
end;
$$;

grant execute on function marcar_pedido_cobrado(uuid) to authenticated;

-- marcar_pedido_pagado queda retirada: su único caller (el botón
-- "Marcar pagado (manual)" de PedidosOnline.jsx) pasa a usar
-- marcar_pedido_cobrado. No tiene sentido mantenerla -- sería un
-- segundo camino redundante hacia lo mismo, y 'pagado' ya no es un
-- estado al que nada transicione de acá en adelante.
drop function if exists marcar_pedido_pagado(uuid);

-- =========================================================
-- movimientos_dinero: la fuente de pedidos_online filtraba por
-- ESTADO, no por fecha_pago -- con el cambio de fondo eso es un bug
-- real: un pedido en efectivo puede llegar a 'en_camino' sin haber
-- cobrado todavía, y con el filtro viejo aparecería como ingreso de
-- todos modos. Se corrige para que sea fecha_pago la única fuente de
-- verdad (se mantiene la exclusión de 'cancelado' que ya existía
-- implícitamente en el filtro anterior).
-- =========================================================

create or replace view movimientos_dinero
with (security_invoker = true)
as
select
  pv.id as id,
  'ingreso' as tipo,
  v.fecha_hora as fecha,
  pv.monto as monto,
  'Venta - ' || coalesce(u.nombre, 'Cajero') as motivo,
  v.sucursal_id as sucursal_id
from pagos_venta pv
join ventas v on v.id = pv.venta_id
left join usuarios u on u.id = v.usuario_id
where v.estado = 'activa'

union all

select
  pf.id,
  'ingreso',
  pf.fecha,
  pf.monto,
  'Cobro de fiado - ' || cf.nombre,
  pf.sucursal_id
from pagos_fiados pf
join clientes_fiados cf on cf.id = pf.cliente_fiado_id

union all

select
  g.id,
  'egreso',
  g.fecha,
  g.monto,
  'Gasto - ' || g.concepto,
  g.sucursal_id
from gastos g

union all

select
  pp.id,
  'egreso',
  pp.fecha,
  pp.monto,
  'Pago a proveedor - ' || p.nombre,
  pp.sucursal_id
from pagos_proveedor pp
join proveedores p on p.id = pp.proveedor_id

union all

select
  po.id,
  'ingreso',
  po.fecha_pago,
  po.total::numeric(12,2),
  'Pedido online - ' || po.cliente_nombre,
  po.sucursal_id
from pedidos_online po
where po.fecha_pago is not null and po.estado <> 'cancelado';

grant select on movimientos_dinero to authenticated;
