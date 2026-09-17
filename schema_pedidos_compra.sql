-- =========================================================
-- Estado de compras: distinguir "pedido hecho, todavía no
-- llegó" ('pedido') de "compra confirmada, ya impactó stock"
-- ('confirmada').
-- =========================================================

alter table compras_proveedor
  add column if not exists estado text not null default 'pedido'
    check (estado in ('pedido', 'confirmada'));

-- Backfill: toda compra que ya existía ANTES de esta migración fue
-- creada por registrar_compra / registrar_compra_por_plantilla, que ya
-- cargan costo_unitario/subtotal y disparan a las funciones que
-- actualizan stock -- son compras confirmadas, no pedidos pendientes.
-- Sin este UPDATE, el ADD COLUMN de arriba las dejaría mal etiquetadas
-- como 'pedido' (default aplicado también a filas existentes). Corre
-- una sola vez, en el mismo momento en que se agrega la columna, así
-- que en este punto TODAS las filas de la tabla son históricas.
update compras_proveedor set estado = 'confirmada';

-- El precio y el subtotal de cada línea recién se conocen al confirmar
-- la compra -- mientras el pedido está en estado 'pedido' pueden
-- quedar en null.
alter table detalle_compras alter column costo_unitario drop not null;
alter table detalle_compras alter column subtotal drop not null;

-- =========================================================
-- crear_pedido_compra: registra un pedido SIN precio todavía (columna
-- "Pedido" de la pantalla de compras). No toca stock ni costo_vigente
-- -- la mercadería todavía no llegó.
--
-- Se llama desde React con:
--   supabase.rpc('crear_pedido_compra', {
--     p_sucursal_id: '...',
--     p_proveedor_id: '...',
--     p_items: [
--       { producto_id: '...', unidad_venta_id: '...', cantidad: 5 }
--     ]
--   })
-- =========================================================

create or replace function crear_pedido_compra(
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
begin
  if p_sucursal_id is null then
    raise exception 'p_sucursal_id es obligatorio';
  end if;

  if p_proveedor_id is null then
    raise exception 'p_proveedor_id es obligatorio';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido necesita al menos un item';
  end if;

  insert into compras_proveedor (sucursal_id, proveedor_id, fecha, monto_total, estado)
  values (p_sucursal_id, p_proveedor_id, now(), 0, 'pedido')
  returning id into v_compra_id;

  insert into detalle_compras (compra_id, producto_id, unidad_venta_id, cantidad)
  select
    v_compra_id,
    (elem->>'producto_id')::uuid,
    (elem->>'unidad_venta_id')::uuid,
    (elem->>'cantidad')::numeric
  from jsonb_array_elements(p_items) as elem;

  return v_compra_id;
end;
$$;

grant execute on function crear_pedido_compra(uuid, uuid, jsonb) to authenticated;

-- =========================================================
-- confirmar_pedido_compra: pasa un pedido de 'pedido' a 'confirmada'.
-- Reemplaza TODO el detalle de la compra por el que llega en p_items
-- (en vez de diffear línea por línea) porque en el sidebar de
-- confirmación el usuario puede haber agregado, quitado o editado
-- libremente cualquier línea respecto del pedido original. Cada línea
-- necesita costo_unitario > 0 -- recién acá se vuelve obligatorio.
--
-- Se llama desde React con:
--   supabase.rpc('confirmar_pedido_compra', {
--     p_compra_id: '...',
--     p_items: [
--       { producto_id: '...', unidad_venta_id: '...', cantidad: 5, costo_unitario: 900 }
--     ]
--   })
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
  end loop;

  -- TODO(impacto de stock): acá falta, por cada línea de p_items --
  --   1) sumar cantidad * factor_conversion_base de la unidad al
  --      stock_actual_unidad_base del producto + actualizar
  --      fecha_ultimo_ingreso (igual que registrar_compra en
  --      rpc_registrar_compra.sql).
  --   2) si costo_unitario difiere del costo_vigente actual de la
  --      unidad, actualizar unidades_venta_producto.costo_vigente y
  --      dejar registro en historial_precios.
  -- Se deja pendiente a pedido explícito del usuario -- por ahora esta
  -- función solo persiste precios/cantidades y cambia el estado.

  update compras_proveedor
  set estado = 'confirmada',
      monto_total = v_monto_total
  where id = p_compra_id;
end;
$$;

grant execute on function confirmar_pedido_compra(uuid, jsonb) to authenticated;
