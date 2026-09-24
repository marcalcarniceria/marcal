-- =========================================================
-- Costo histórico en pedidos online: hasta ahora detalle_pedidos
-- guardaba precio_unitario pero NUNCA el costo -- a diferencia de
-- detalle_ventas (costo_unitario_historico), que sí lo tiene desde el
-- principio. Sin esto, el Reporte 1 de Reportes (Ganancias por período)
-- no puede calcular margen de los pedidos de la tienda online.
--
-- A partir de acá, cada línea nueva de detalle_pedidos guarda el
-- costo_vigente del producto (o, para combos, la suma de
-- factor_cantidad * costo_vigente de sus ingredientes, igual que ya
-- hace registrar_venta con las ventas de mostrador) al momento de crear
-- el pedido. Los pedidos YA existentes quedan con esta columna en NULL
-- -- no hay forma de reconstruir ese dato retroactivamente -- así que
-- cualquier reporte que la use tiene que contemplar ese caso (excluir
-- esas líneas del cálculo de ganancia, no asumir 0).
--
-- Único cambio respecto de schema_combos_snapshot.sql: se agrega
-- v_costo (declarada, calculada en las dos ramas -- producto y combo --
-- e insertada). Mismos parámetros de siempre, así que no hace falta
-- dropear la función.
-- =========================================================

alter table detalle_pedidos add column if not exists costo_unitario_historico numeric;

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
  v_costo numeric;
  v_stock numeric;
  v_factor numeric;
  v_cantidad numeric;
  v_subtotal numeric;
  v_subtotal_productos numeric := 0;
  v_costo_envio numeric;
  v_total numeric;
  v_stock_insuficiente boolean;
  v_faltante numeric;
  v_combo_id uuid;
  v_combo_nombre text;
  v_combo_activo boolean;
  v_combos_armables numeric;
  v_detalle_id uuid;
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
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_combo_id := nullif(v_item->>'combo_id', '')::uuid;

    if v_combo_id is not null then
      -- ---------- Línea de combo ----------
      v_combo_nombre := null;
      select c.sucursal_id, c.nombre, c.precio_fijo, c.activo
        into v_producto_sucursal, v_combo_nombre, v_precio, v_combo_activo
        from combos c
        where c.id = v_combo_id
        for share;

      if v_combo_nombre is null then
        raise exception 'El combo % no existe', v_combo_id;
      end if;

      if v_producto_sucursal <> p_sucursal_id then
        raise exception 'El combo % no pertenece a esta sucursal', v_combo_id;
      end if;

      if not v_combo_activo then
        raise exception 'El combo "%" ya no está disponible', v_combo_nombre;
      end if;

      -- Costo del combo: misma cuenta que registrar_venta (suma de
      -- factor_cantidad * costo_vigente de cada ingrediente).
      select sum(ci.factor_cantidad * uvp.costo_vigente)
        into v_costo
        from combo_ingredientes ci
        join unidades_venta_producto uvp on uvp.id = ci.unidad_venta_id
        where ci.combo_id = v_combo_id;

      -- Cuántos combos enteros se pueden armar hoy (ingrediente limitante,
      -- consumo sumado por producto).
      select min(floor(p.stock_actual_unidad_base / x.consumo))
        into v_combos_armables
        from (
          select ci.producto_id, sum(ci.factor_cantidad * uvp.factor_conversion_base) as consumo
          from combo_ingredientes ci
          join unidades_venta_producto uvp on uvp.id = ci.unidad_venta_id
          where ci.combo_id = v_combo_id
          group by ci.producto_id
        ) x
        join productos p on p.id = x.producto_id;

      if v_combos_armables is null then
        raise exception 'El combo "%" no tiene ingredientes cargados', v_combo_nombre;
      end if;

      if v_combos_armables < v_cantidad then
        v_stock_insuficiente := true;
        v_faltante := v_cantidad - greatest(v_combos_armables, 0);
      else
        v_stock_insuficiente := false;
        v_faltante := null;
      end if;

      v_subtotal := v_cantidad * v_precio;
      v_subtotal_productos := v_subtotal_productos + v_subtotal;

      insert into detalle_pedidos (
        pedido_id, combo_id, cantidad, precio_unitario, costo_unitario_historico, subtotal,
        stock_insuficiente, faltante
      ) values (
        v_pedido_id, v_combo_id, v_cantidad, v_precio, v_costo, v_subtotal,
        v_stock_insuficiente, v_faltante
      )
      returning id into v_detalle_id;

      -- Foto de la receta: desde acá este pedido ya no depende de
      -- combo_ingredientes.
      insert into detalle_pedidos_combo_ingredientes (
        detalle_pedido_id, producto_id, unidad_venta_id, factor_cantidad, factor_conversion_base
      )
      select v_detalle_id, ci.producto_id, ci.unidad_venta_id, ci.factor_cantidad, uvp.factor_conversion_base
      from combo_ingredientes ci
      join unidades_venta_producto uvp on uvp.id = ci.unidad_venta_id
      where ci.combo_id = v_combo_id;
    else
      -- ---------- Línea de producto ----------
      v_producto_sucursal := null;
      select p.sucursal_id,
             coalesce(uvp.precio_promocional, uvp.precio_venta),
             uvp.costo_vigente,
             uvp.factor_conversion_base,
             p.stock_actual_unidad_base
        into v_producto_sucursal, v_precio, v_costo, v_factor, v_stock
        from productos p
        join unidades_venta_producto uvp on uvp.id = (v_item->>'unidad_venta_id')::uuid
        where p.id = (v_item->>'producto_id')::uuid;

      if v_producto_sucursal is null then
        raise exception 'Producto % o unidad % no existe', v_item->>'producto_id', v_item->>'unidad_venta_id';
      end if;

      if v_producto_sucursal <> p_sucursal_id then
        raise exception 'Producto % no pertenece a esta sucursal', v_item->>'producto_id';
      end if;

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
        pedido_id, producto_id, unidad_venta_id, cantidad, precio_unitario,
        costo_unitario_historico, subtotal, stock_insuficiente, faltante
      ) values (
        v_pedido_id, (v_item->>'producto_id')::uuid, (v_item->>'unidad_venta_id')::uuid,
        v_cantidad, v_precio, v_costo, v_subtotal,
        v_stock_insuficiente, v_faltante
      );
    end if;
  end loop;

  v_total := v_subtotal_productos + v_costo_envio;

  update pedidos_online
  set subtotal_productos = v_subtotal_productos,
      total = v_total
  where id = v_pedido_id;

  return jsonb_build_object('pedido_id', v_pedido_id, 'total', v_total);
end;
$$;
