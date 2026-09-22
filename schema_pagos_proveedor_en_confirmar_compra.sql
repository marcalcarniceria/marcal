-- =========================================================
-- Fix: las compras a proveedor nunca generaban un movimiento de dinero.
--
-- Causa: compras_proveedor guarda el monto_total de la compra, pero
-- movimientos_dinero (ver schema_movimientos_dinero.sql) lee los
-- egresos de proveedor desde pagos_proveedor, no desde
-- compras_proveedor directamente. Nada insertaba en pagos_proveedor:
-- esa tabla se diseñó como cuenta corriente separada ("se maneja en
-- una pantalla aparte más adelante", ver rls_setup_compras.sql), pero
-- esa pantalla nunca se construyó. Resultado: comprás, el stock sube,
-- pero la plata gastada no aparece en ningún lado.
--
-- Decisión aplicada (confirmada por el dueño): las compras se pagan de
-- contado, al momento de confirmarlas -- no hay cuenta corriente con
-- proveedores hoy. Así que confirmar_pedido_compra (el único camino
-- REALMENTE usado desde el frontend hoy -- CompraProveedor.jsx solo
-- llama a crear_pedido_compra + confirmar_pedido_compra, nunca a
-- registrar_compra ni registrar_compra_por_plantilla) ahora también
-- inserta el pago completo en pagos_proveedor en el mismo momento que
-- confirma la compra. registrar_compra y registrar_compra_por_plantilla
-- se corrigen igual por las dudas (no están conectadas a ningún botón
-- hoy, pero si el día de mañana se reactivan no deberían reabrir este
-- mismo bug).
--
-- Método de pago: se agrega p_metodo_pago_id (uuid, default null) a
-- las 3 funciones. Si no se pasa ninguno (compatibilidad con cualquier
-- llamada vieja), se usa "Efectivo" de metodos_pago, y si no existe una
-- fila con ese nombre, la primera que haya -- para que esto funcione
-- aunque el frontend todavía no mande el método explícitamente. El
-- frontend de CompraProveedor.jsx igual se actualiza para pedirlo.
--
-- NOTA sobre compras históricas: esto NO reconstruye retroactivamente
-- los pagos de compras ya confirmadas antes de este fix (pagos_proveedor
-- no guarda compra_id -- no hay forma confiable de saber cuáles ya
-- tienen pago y cuáles no sin arriesgarse a duplicar). Si querés que
-- esas compras viejas también aparezcan en Movimientos de Dinero,
-- avisame y armamos ese backfill aparte revisando caso por caso.
-- =========================================================

create or replace function confirmar_pedido_compra(
  p_compra_id uuid,
  p_items jsonb,
  p_metodo_pago_id uuid default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_estado text;
  v_sucursal_id uuid;
  v_proveedor_id uuid;
  v_monto_total numeric := 0;
  v_elem jsonb;
  v_subtotal numeric;
  v_factor numeric;
  v_costo_anterior numeric;
  v_precio_actual numeric;
  v_metodo_pago_id uuid;
begin
  if p_compra_id is null then
    raise exception 'p_compra_id es obligatorio';
  end if;

  select estado, sucursal_id, proveedor_id
    into v_estado, v_sucursal_id, v_proveedor_id
    from compras_proveedor where id = p_compra_id;

  if v_estado is null then
    raise exception 'La compra no existe';
  end if;

  if v_estado <> 'pedido' then
    raise exception 'La compra ya está confirmada';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra necesita al menos un item';
  end if;

  for v_elem in select * from jsonb_array_elements(p_items)
  loop
    if (v_elem->>'costo_unitario') is null or (v_elem->>'costo_unitario')::numeric <= 0 then
      raise exception 'Todas las líneas necesitan un costo mayor a cero';
    end if;
  end loop;

  delete from detalle_compras where compra_id = p_compra_id;

  for v_elem in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := (v_elem->>'cantidad')::numeric * (v_elem->>'costo_unitario')::numeric;
    v_monto_total := v_monto_total + v_subtotal;

    insert into detalle_compras (
      compra_id, producto_id, unidad_venta_id, cantidad, costo_unitario, subtotal
    ) values (
      p_compra_id,
      (v_elem->>'producto_id')::uuid,
      (v_elem->>'unidad_venta_id')::uuid,
      (v_elem->>'cantidad')::numeric,
      (v_elem->>'costo_unitario')::numeric,
      v_subtotal
    );

    select uvp.factor_conversion_base, uvp.costo_vigente, uvp.precio_venta
      into v_factor, v_costo_anterior, v_precio_actual
      from unidades_venta_producto uvp
      where uvp.id = (v_elem->>'unidad_venta_id')::uuid;

    if v_factor is null then
      raise exception 'Unidad de venta % no existe', v_elem->>'unidad_venta_id';
    end if;

    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base + (v_elem->>'cantidad')::numeric * v_factor,
        fecha_ultimo_ingreso = current_date
    where id = (v_elem->>'producto_id')::uuid;

    if not found then
      raise exception 'Producto % no existe', v_elem->>'producto_id';
    end if;

    if v_costo_anterior is distinct from (v_elem->>'costo_unitario')::numeric then
      insert into historial_precios (
        unidad_venta_id, precio_anterior, precio_nuevo,
        costo_anterior, costo_nuevo, fecha_cambio
      ) values (
        (v_elem->>'unidad_venta_id')::uuid,
        v_precio_actual, v_precio_actual,
        v_costo_anterior, (v_elem->>'costo_unitario')::numeric, now()
      );

      update unidades_venta_producto
      set costo_vigente = (v_elem->>'costo_unitario')::numeric
      where id = (v_elem->>'unidad_venta_id')::uuid;
    end if;
  end loop;

  update compras_proveedor
  set estado = 'confirmada',
      monto_total = v_monto_total
  where id = p_compra_id;

  -- Compras de contado: el pago se registra en el mismo momento que se
  -- confirma la compra, por el monto total confirmado.
  v_metodo_pago_id := coalesce(
    p_metodo_pago_id,
    (select id from metodos_pago where lower(nombre) = 'efectivo' limit 1),
    (select id from metodos_pago order by nombre limit 1)
  );

  insert into pagos_proveedor (sucursal_id, proveedor_id, monto, fecha, metodo_pago_id)
  values (v_sucursal_id, v_proveedor_id, v_monto_total, now(), v_metodo_pago_id);
end;
$$;

grant execute on function confirmar_pedido_compra(uuid, jsonb, uuid) to authenticated;

-- =========================================================
-- registrar_compra y registrar_compra_por_plantilla: no están
-- conectadas a ningún botón del frontend hoy (CompraProveedor.jsx solo
-- usa crear_pedido_compra + confirmar_pedido_compra), pero se corrigen
-- igual para que no reabran este bug si se vuelven a usar.
-- =========================================================

create or replace function registrar_compra(
  p_sucursal_id uuid,
  p_proveedor_id uuid,
  p_items jsonb,
  p_metodo_pago_id uuid default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_compra_id uuid;
  v_monto_total numeric := 0;
  v_item jsonb;
  v_subtotal numeric;
  v_factor numeric;
  v_costo_anterior numeric;
  v_precio_actual numeric;
  v_metodo_pago_id uuid;
begin
  if p_sucursal_id is null then
    raise exception 'p_sucursal_id es obligatorio';
  end if;

  if p_proveedor_id is null then
    raise exception 'p_proveedor_id es obligatorio';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'La compra necesita al menos un item';
  end if;

  insert into compras_proveedor (sucursal_id, proveedor_id, fecha, monto_total)
  values (p_sucursal_id, p_proveedor_id, now(), 0)
  returning id into v_compra_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := (v_item->>'cantidad')::numeric * (v_item->>'costo_unitario')::numeric;
    v_monto_total := v_monto_total + v_subtotal;

    insert into detalle_compras (
      compra_id, producto_id, unidad_venta_id, cantidad, costo_unitario, subtotal
    ) values (
      v_compra_id,
      (v_item->>'producto_id')::uuid,
      (v_item->>'unidad_venta_id')::uuid,
      (v_item->>'cantidad')::numeric,
      (v_item->>'costo_unitario')::numeric,
      v_subtotal
    );

    select uvp.factor_conversion_base, uvp.costo_vigente, uvp.precio_venta
      into v_factor, v_costo_anterior, v_precio_actual
      from unidades_venta_producto uvp
      where uvp.id = (v_item->>'unidad_venta_id')::uuid;

    if v_factor is null then
      raise exception 'Unidad de venta % no existe', v_item->>'unidad_venta_id';
    end if;

    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base + (v_item->>'cantidad')::numeric * v_factor,
        fecha_ultimo_ingreso = current_date
    where id = (v_item->>'producto_id')::uuid;

    if not found then
      raise exception 'Producto % no existe o no pertenece a tu sucursal', v_item->>'producto_id';
    end if;

    if v_costo_anterior is distinct from (v_item->>'costo_unitario')::numeric then
      insert into historial_precios (
        unidad_venta_id, precio_anterior, precio_nuevo,
        costo_anterior, costo_nuevo, fecha_cambio
      ) values (
        (v_item->>'unidad_venta_id')::uuid,
        v_precio_actual, v_precio_actual,
        v_costo_anterior, (v_item->>'costo_unitario')::numeric, now()
      );

      update unidades_venta_producto
      set costo_vigente = (v_item->>'costo_unitario')::numeric
      where id = (v_item->>'unidad_venta_id')::uuid;
    end if;
  end loop;

  update compras_proveedor
  set monto_total = v_monto_total
  where id = v_compra_id;

  v_metodo_pago_id := coalesce(
    p_metodo_pago_id,
    (select id from metodos_pago where lower(nombre) = 'efectivo' limit 1),
    (select id from metodos_pago order by nombre limit 1)
  );

  insert into pagos_proveedor (sucursal_id, proveedor_id, monto, fecha, metodo_pago_id)
  values (p_sucursal_id, p_proveedor_id, v_monto_total, now(), v_metodo_pago_id);

  return v_compra_id;
end;
$$;

grant execute on function registrar_compra(uuid, uuid, jsonb, uuid) to authenticated;

create or replace function registrar_compra_por_plantilla(
  p_sucursal_id uuid,
  p_proveedor_id uuid,
  p_plantilla_id uuid,
  p_peso_total numeric,
  p_costo_total numeric,
  p_metodo_pago_id uuid default null
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
  v_metodo_pago_id uuid;
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

  v_metodo_pago_id := coalesce(
    p_metodo_pago_id,
    (select id from metodos_pago where lower(nombre) = 'efectivo' limit 1),
    (select id from metodos_pago order by nombre limit 1)
  );

  insert into pagos_proveedor (sucursal_id, proveedor_id, monto, fecha, metodo_pago_id)
  values (p_sucursal_id, p_proveedor_id, v_monto_total, now(), v_metodo_pago_id);

  return v_compra_id;
end;
$$;

grant execute on function registrar_compra_por_plantilla(uuid, uuid, uuid, numeric, numeric, uuid) to authenticated;
