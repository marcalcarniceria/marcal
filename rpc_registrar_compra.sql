-- =========================================================
-- registrar_compra: crea una compra completa en una sola
-- transacción atómica (compra + detalle + aumento de stock +
-- actualización de costo_vigente + historial_precios).
--
-- Solo el dueño puede ejecutarla (mismo criterio que las RLS
-- de proveedores/compras_proveedor/detalle_compras).
--
-- Se llama desde React con:
--   supabase.rpc('registrar_compra', {
--     p_sucursal_id: '...',
--     p_proveedor_id: '...',
--     p_items: [
--       { producto_id: '...', unidad_venta_id: '...',
--         cantidad: 10, costo_unitario: 900 }
--     ]
--   })
-- =========================================================

create or replace function registrar_compra(
  p_sucursal_id uuid,
  p_proveedor_id uuid,
  p_items jsonb
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

  -- 1) Crear la cabecera de la compra (monto_total en 0, se actualiza al final)
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

    -- Traer factor de conversión, costo vigente y precio actuales de la unidad
    select uvp.factor_conversion_base, uvp.costo_vigente, uvp.precio_venta
      into v_factor, v_costo_anterior, v_precio_actual
      from unidades_venta_producto uvp
      where uvp.id = (v_item->>'unidad_venta_id')::uuid;

    if v_factor is null then
      raise exception 'Unidad de venta % no existe', v_item->>'unidad_venta_id';
    end if;

    -- Aumentar stock (en unidad base) y actualizar fecha de último ingreso
    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base + (v_item->>'cantidad')::numeric * v_factor,
        fecha_ultimo_ingreso = current_date
    where id = (v_item->>'producto_id')::uuid;

    if not found then
      raise exception 'Producto % no existe o no pertenece a tu sucursal', v_item->>'producto_id';
    end if;

    -- Si el costo cambió, actualizar costo_vigente y dejar registro en historial_precios
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

  return v_compra_id;
end;
$$;

grant execute on function registrar_compra(uuid, uuid, jsonb) to authenticated;
