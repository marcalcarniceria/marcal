-- =========================================================
-- Precio promocional (Fase 2): se cobra en la web y en el mostrador.
-- Requiere schema_precio_promocional.sql (columna
-- unidades_venta_producto.precio_promocional).
--
-- Regla única en los tres lugares:
--   precio a cobrar = coalesce(precio_promocional, precio_venta)
-- Automática y sin forma de desactivarla desde la caja (decisión de
-- negocio: velocidad operativa).
-- =========================================================


-- =========================================================
-- 1) productos_mas_vendidos: catálogo de la caja. Suma la columna
-- precio_promocional al final para que Cajero.jsx pueda mostrar la
-- oferta. Cambiar las columnas que devuelve una función con RETURNS
-- TABLE no se puede con CREATE OR REPLACE -- hay que dropearla primero.
-- Resto idéntico a rpc_productos_mas_vendidos.sql.
-- =========================================================

drop function if exists productos_mas_vendidos(uuid);

create function productos_mas_vendidos(p_sucursal_id uuid)
returns table (
  producto_id uuid,
  producto_nombre text,
  unidad_venta_id uuid,
  unidad_nombre text,
  precio_venta numeric,
  costo_vigente numeric,
  factor_conversion_base numeric,
  stock_actual_unidad_base numeric,
  ventas_count bigint,
  precio_promocional numeric
)
language sql
security invoker
set search_path = public
as $$
  select
    p.id as producto_id,
    p.nombre as producto_nombre,
    uvp.id as unidad_venta_id,
    uvp.nombre_unidad as unidad_nombre,
    uvp.precio_venta,
    uvp.costo_vigente,
    uvp.factor_conversion_base,
    p.stock_actual_unidad_base,
    coalesce(v.ventas_count, 0) as ventas_count,
    uvp.precio_promocional
  from productos p
  join unidades_venta_producto uvp on uvp.producto_id = p.id
  left join (
    select dv.unidad_venta_id, count(*) as ventas_count
    from detalle_ventas dv
    join ventas ve on ve.id = dv.venta_id
    where ve.sucursal_id = p_sucursal_id
      and ve.estado = 'activa'
      and ve.fecha_hora > now() - interval '90 days'
    group by dv.unidad_venta_id
  ) v on v.unidad_venta_id = uvp.id
  where p.sucursal_id = p_sucursal_id
    and p.activo = true
  order by ventas_count desc, p.nombre asc, uvp.nombre_unidad asc;
$$;

grant execute on function productos_mas_vendidos(uuid) to authenticated;


-- =========================================================
-- 2) crear_pedido_online: único cambio respecto de
-- schema_metodo_pago_entrega_cobro.sql es el precio que se lee de
-- unidades_venta_producto (coalesce con la promo). Como ya era así, el
-- precio sale siempre de la base, nunca del carrito del cliente.
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
    select p.sucursal_id,
           coalesce(uvp.precio_promocional, uvp.precio_venta),
           uvp.factor_conversion_base,
           p.stock_actual_unidad_base
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
-- 3) registrar_venta: hasta ahora confiaba en el
-- precio_unitario_historico que mandaba la caja. Ahora el precio lo
-- define la base (coalesce con la promo), igual que en la web.
--
-- Si el precio que mandó la caja no coincide (la pantalla se cargó antes
-- de que el dueño pusiera o sacara una promo), se rechaza la venta con un
-- mensaje claro en vez de cobrar un monto distinto al que vio el
-- cliente -- los pagos ya se validan contra el total, así que igual
-- fallaría, pero con un error confuso.
--
-- Mismos parámetros que rpc_registrar_venta.sql: Cajero.jsx no cambia la
-- llamada.
-- =========================================================

create or replace function registrar_venta(
  p_sucursal_id uuid,
  p_descuento_general numeric,
  p_items jsonb,
  p_pagos jsonb,
  p_cliente_fiado_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta_id uuid;
  v_total_bruto numeric := 0;
  v_total_items_neto numeric := 0;
  v_total_neto numeric := 0;
  v_total_pagado numeric := 0;
  v_item jsonb;
  v_pago jsonb;
  v_subtotal numeric;
  v_producto_sucursal uuid;
  v_producto_nombre text;
  v_factor numeric;
  v_precio numeric;
  v_cantidad numeric;
begin
  if p_sucursal_id is null then
    raise exception 'p_sucursal_id es obligatorio';
  end if;

  -- Reemplaza la validación que antes hacía la policy de INSERT de ventas
  if auth_rol() <> 'dueño' and p_sucursal_id <> auth_sucursal() then
    raise exception 'No tenés permiso para vender en esa sucursal';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'La venta necesita al menos un item';
  end if;

  if p_cliente_fiado_id is not null then
    if not exists (
      select 1 from clientes_fiados
      where id = p_cliente_fiado_id and sucursal_id = p_sucursal_id
    ) then
      raise exception 'El cliente fiado no existe o no pertenece a esta sucursal';
    end if;
  end if;

  -- 1) Crear la cabecera de la venta (totales en 0, se actualizan al final)
  insert into ventas (
    sucursal_id, usuario_id, fecha_hora,
    total_bruto, descuento_general, total_neto,
    cliente_fiado_id, estado
  ) values (
    p_sucursal_id, auth.uid(), now(),
    0, coalesce(p_descuento_general, 0), 0,
    p_cliente_fiado_id, 'activa'
  )
  returning id into v_venta_id;

  -- 2) Por cada item: validar producto, fijar el precio desde la base,
  --    insertar el detalle y descontar stock
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Como la función bypasea RLS, hay que validar a mano que el
    -- producto pertenezca a la sucursal de la venta
    select p.sucursal_id, p.nombre, uvp.factor_conversion_base,
           coalesce(uvp.precio_promocional, uvp.precio_venta)
      into v_producto_sucursal, v_producto_nombre, v_factor, v_precio
      from productos p
      join unidades_venta_producto uvp on uvp.id = (v_item->>'unidad_venta_id')::uuid
      where p.id = (v_item->>'producto_id')::uuid
      for update of p;

    if v_producto_sucursal is null then
      raise exception 'Producto % o unidad de venta % no existe', v_item->>'producto_id', v_item->>'unidad_venta_id';
    end if;

    if v_producto_sucursal <> p_sucursal_id then
      raise exception 'Producto % no pertenece a la sucursal de la venta', v_item->>'producto_id';
    end if;

    if abs(v_precio - (v_item->>'precio_unitario_historico')::numeric) > 0.01 then
      raise exception 'El precio de "%" cambió (ahora $%). Recargá la pantalla de caja y volvé a cargar la venta.',
        v_producto_nombre, v_precio;
    end if;

    v_cantidad := (v_item->>'cantidad')::numeric;
    v_subtotal := v_cantidad * v_precio
                  - coalesce((v_item->>'descuento_aplicado')::numeric, 0);

    insert into detalle_ventas (
      venta_id, producto_id, unidad_venta_id, cantidad,
      costo_unitario_historico, precio_unitario_historico,
      descuento_aplicado, subtotal
    ) values (
      v_venta_id,
      (v_item->>'producto_id')::uuid,
      (v_item->>'unidad_venta_id')::uuid,
      v_cantidad,
      (v_item->>'costo_unitario_historico')::numeric,
      v_precio,
      coalesce((v_item->>'descuento_aplicado')::numeric, 0),
      v_subtotal
    );

    v_total_bruto := v_total_bruto + v_cantidad * v_precio;
    v_total_items_neto := v_total_items_neto + v_subtotal;

    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base - v_cantidad * v_factor
    where id = (v_item->>'producto_id')::uuid;
  end loop;

  v_total_neto := v_total_items_neto - coalesce(p_descuento_general, 0);

  -- 3) Insertar los pagos y validar que sumen el total neto
  --    (venta fiada: va todo a cuenta del cliente, sin pagos ahora)
  for v_pago in select * from jsonb_array_elements(p_pagos)
  loop
    insert into pagos_venta (venta_id, metodo_pago_id, monto)
    values (
      v_venta_id,
      (v_pago->>'metodo_pago_id')::uuid,
      (v_pago->>'monto')::numeric
    );

    v_total_pagado := v_total_pagado + (v_pago->>'monto')::numeric;
  end loop;

  if p_cliente_fiado_id is null then
    if abs(v_total_pagado - v_total_neto) > 0.01 then
      raise exception 'La suma de los pagos (%) no coincide con el total neto (%)', v_total_pagado, v_total_neto;
    end if;
  else
    if v_total_pagado > 0 then
      raise exception 'Una venta fiada no debe incluir pagos: el monto completo (%) queda a cuenta del cliente', v_total_neto;
    end if;
  end if;

  -- 4) Actualizar los totales finales de la venta
  update ventas
  set total_bruto = v_total_bruto,
      total_neto = v_total_neto
  where id = v_venta_id;

  return v_venta_id;
end;
$$;

grant execute on function registrar_venta(uuid, numeric, jsonb, jsonb, uuid) to authenticated;
