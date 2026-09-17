-- =========================================================
-- Resuelve el TODO que había quedado en confirmar_pedido_compra
-- (ver schema_pedidos_compra.sql): al confirmar un pedido, además
-- de guardar precio/cantidad y cambiar el estado, ahora también:
--   1) suma stock a productos.stock_actual_unidad_base (convertido
--      a unidad base con factor_conversion_base -- la cantidad de
--      detalle_compras está en la unidad de venta elegida, ej.
--      "Cajón", no en la unidad base del stock).
--   2) actualiza unidades_venta_producto.costo_vigente.
--   3) si el costo cambió, deja un registro en historial_precios.
-- Mismo patrón que registrar_compra (rpc_registrar_compra.sql), que
-- ya está probado y funcionando en producción.
--
-- Todo dentro de la misma función PL/pgSQL = misma transacción
-- implícita de la llamada a supabase.rpc(...): si cualquier paso
-- lanza una excepción (ej. unidad de venta inexistente), Postgres
-- revierte TODO lo que esta función haya hecho hasta ese punto
-- (el UPDATE de stock, el INSERT de historial, el cambio de estado,
-- etc.) -- no quedan cambios a medio aplicar. No hace falta una
-- Edge Function aparte para esto.
-- =========================================================

create or replace function confirmar_pedido_compra(
  p_compra_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security invoker
as $$
declare
  v_estado text;
  v_monto_total numeric := 0;
  v_elem jsonb;
  v_subtotal numeric;
  v_factor numeric;
  v_costo_anterior numeric;
  v_precio_actual numeric;
begin
  if p_compra_id is null then
    raise exception 'p_compra_id es obligatorio';
  end if;

  select estado into v_estado from compras_proveedor where id = p_compra_id;

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

    -- Impacto de stock/costo (antes era el TODO) -- mismo patrón que
    -- registrar_compra en rpc_registrar_compra.sql.
    select uvp.factor_conversion_base, uvp.costo_vigente, uvp.precio_venta
      into v_factor, v_costo_anterior, v_precio_actual
      from unidades_venta_producto uvp
      where uvp.id = (v_elem->>'unidad_venta_id')::uuid;

    if v_factor is null then
      raise exception 'Unidad de venta % no existe', v_elem->>'unidad_venta_id';
    end if;

    -- La cantidad de detalle_compras está en la unidad de venta elegida
    -- (ej. "Cajón"), no en la unidad base del stock -- se multiplica por
    -- factor_conversion_base para convertir antes de sumar.
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
end;
$$;

grant execute on function confirmar_pedido_compra(uuid, jsonb) to authenticated;
