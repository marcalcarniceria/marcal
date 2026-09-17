-- =========================================================
-- registrar_venta: crea una venta completa en una sola
-- transacción atómica (venta + detalle + pagos + descuento
-- de stock). Si cualquier paso falla, Postgres revierte todo.
--
-- SECURITY DEFINER: necesario porque `ventas` no tiene policy de
-- UPDATE (a propósito, para que nadie edite una venta ya hecha
-- desde el cliente) — sin esto, el UPDATE final de los totales
-- queda bloqueado en silencio por RLS. Al ser DEFINER, la función
-- hace ella misma las validaciones de permisos que RLS haría.
--
-- Se llama desde React con:
--   supabase.rpc('registrar_venta', {
--     p_sucursal_id: '...',
--     p_descuento_general: 0,
--     p_items: [
--       { producto_id: '...', unidad_venta_id: '...', cantidad: 2,
--         precio_unitario_historico: 1500, costo_unitario_historico: 900,
--         descuento_aplicado: 0 }
--     ],
--     p_pagos: [
--       { metodo_pago_id: '...', monto: 3000 }
--     ]
--   })
--
-- El total_bruto/total_neto se calculan server-side a partir de
-- p_items, no se confía en un total mandado desde el cliente.
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
  v_factor numeric;
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

  -- 2) Insertar cada item de detalle_ventas y descontar stock
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := (v_item->>'cantidad')::numeric
                  * (v_item->>'precio_unitario_historico')::numeric
                  - coalesce((v_item->>'descuento_aplicado')::numeric, 0);

    insert into detalle_ventas (
      venta_id, producto_id, unidad_venta_id, cantidad,
      costo_unitario_historico, precio_unitario_historico,
      descuento_aplicado, subtotal
    ) values (
      v_venta_id,
      (v_item->>'producto_id')::uuid,
      (v_item->>'unidad_venta_id')::uuid,
      (v_item->>'cantidad')::numeric,
      (v_item->>'costo_unitario_historico')::numeric,
      (v_item->>'precio_unitario_historico')::numeric,
      coalesce((v_item->>'descuento_aplicado')::numeric, 0),
      v_subtotal
    );

    v_total_bruto := v_total_bruto + (v_item->>'cantidad')::numeric * (v_item->>'precio_unitario_historico')::numeric;
    v_total_items_neto := v_total_items_neto + v_subtotal;

    -- Como la función bypasea RLS, hay que validar a mano que el
    -- producto pertenezca a la sucursal de la venta
    select p.sucursal_id, uvp.factor_conversion_base
      into v_producto_sucursal, v_factor
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

    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base - (v_item->>'cantidad')::numeric * v_factor
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
