-- =========================================================
-- Combos (Fase 2): venderlos en la web y en el mostrador.
-- Requiere schema_combos.sql y schema_precio_promocional_cobro.sql.
--
-- Una línea de detalle es O un producto (producto_id + unidad_venta_id)
-- O un combo (combo_id). El stock nunca se descuenta del combo: se
-- descuenta de cada ingrediente,
--   cantidad_combos * factor_cantidad * factor_conversion_base
-- sumado por producto (misma cuenta que obtener_combos_tienda).
--
-- CUÁNDO se descuenta no cambia respecto de los productos sueltos:
--   - mostrador: en registrar_venta, al cobrar.
--   - web: en avanzar_pedido_preparacion (NO en crear_pedido_online,
--     que solo marca stock_insuficiente -- ver
--     schema_stock_en_preparacion.sql). Descontar también al crear el
--     pedido descontaría dos veces.
--
-- Limitación conocida: la receta NO se copia en la venta. Si el dueño
-- edita los ingredientes de un combo, (a) un pedido web todavía no
-- preparado descuenta con la receta nueva, y (b) el historial de
-- movimientos de stock muestra las ventas viejas con la receta nueva.
-- =========================================================


-- =========================================================
-- 1) detalle_pedidos / detalle_ventas: columna combo_id + exclusividad
-- =========================================================

alter table detalle_pedidos
  add column if not exists combo_id uuid references combos(id);

alter table detalle_pedidos alter column producto_id drop not null;
alter table detalle_pedidos alter column unidad_venta_id drop not null;

alter table detalle_pedidos
  drop constraint if exists detalle_pedidos_producto_o_combo_check;

alter table detalle_pedidos
  add constraint detalle_pedidos_producto_o_combo_check
  check (
    (producto_id is not null and combo_id is null)
    or (producto_id is null and combo_id is not null)
  );

alter table detalle_ventas
  add column if not exists combo_id uuid references combos(id);

alter table detalle_ventas alter column producto_id drop not null;
alter table detalle_ventas alter column unidad_venta_id drop not null;

alter table detalle_ventas
  drop constraint if exists detalle_ventas_producto_o_combo_check;

alter table detalle_ventas
  add constraint detalle_ventas_producto_o_combo_check
  check (
    (producto_id is not null and combo_id is null)
    or (producto_id is null and combo_id is not null)
  );


-- =========================================================
-- 2) Lectura pública de combos (mismo criterio que
-- productos_select_publico, schema_fix_productos_rls_cliente.sql).
-- Hace falta para que "Mis pedidos" del cliente logueado pueda mostrar
-- el nombre del combo (embed detalle_pedidos -> combos(nombre)); sin
-- esto RLS devuelve null. Solo son datos de catálogo (nombre, precio,
-- descripción), que la tienda ya muestra a cualquier visitante.
-- =========================================================

drop policy if exists "combos_select_publico" on combos;
create policy "combos_select_publico"
on combos
for select
to anon, authenticated
using (true);


-- =========================================================
-- 3) crear_pedido_online: un item puede traer combo_id en vez de
-- producto_id/unidad_venta_id. Precio = combos.precio_fijo, siempre
-- leído de la base. Igual que con los productos, NO descuenta stock:
-- solo marca stock_insuficiente/faltante (en cantidad de combos) si hoy
-- no alcanza para armar todos.
-- Resto idéntico a schema_precio_promocional_cobro.sql.
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
  v_combo_id uuid;
  v_combo_nombre text;
  v_combo_activo boolean;
  v_combos_armables numeric;
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
        where c.id = v_combo_id;

      if v_combo_nombre is null then
        raise exception 'El combo % no existe', v_combo_id;
      end if;

      if v_producto_sucursal <> p_sucursal_id then
        raise exception 'El combo % no pertenece a esta sucursal', v_combo_id;
      end if;

      if not v_combo_activo then
        raise exception 'El combo "%" ya no está disponible', v_combo_nombre;
      end if;

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
        pedido_id, combo_id, cantidad, precio_unitario, subtotal,
        stock_insuficiente, faltante
      ) values (
        v_pedido_id, v_combo_id, v_cantidad, v_precio, v_subtotal,
        v_stock_insuficiente, v_faltante
      );
    else
      -- ---------- Línea de producto (sin cambios) ----------
      v_producto_sucursal := null;
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

grant execute on function crear_pedido_online(uuid, uuid, text, text, text, text, jsonb, uuid, text, text) to anon, authenticated;


-- =========================================================
-- 4) avanzar_pedido_preparacion: acá se descuenta el stock de los
-- pedidos web. Ahora cada línea se "expande" en consumos por producto:
--   - producto: cantidad * factor_conversion_base (como antes)
--   - combo: por cada ingrediente, cantidad * factor_cantidad *
--     factor_conversion_base, sumado por producto
-- Mismas reglas que schema_stock_en_preparacion.sql: solo bloquea si una
-- línea que estaba marcada stock_insuficiente sigue sin alcanzar; todo
-- en una transacción (si algo falla no se descuenta nada).
--
-- Los productos se bloquean (FOR UPDATE) antes del loop, y el stock se
-- vuelve a leer dentro del loop: si dos líneas usan el mismo producto
-- (ej. un combo y ese producto suelto), la segunda ve el stock ya
-- descontado por la primera.
-- =========================================================

create or replace function avanzar_pedido_preparacion(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_sucursal_id uuid;
  v_consumo record;
  v_stock numeric;
begin
  select estado, sucursal_id into v_estado, v_sucursal_id
    from pedidos_online where id = p_pedido_id;

  if v_estado is null then
    raise exception 'El pedido no existe';
  end if;

  if not (auth_rol() = 'dueño' or v_sucursal_id = auth_sucursal()) then
    raise exception 'No autorizado';
  end if;

  if v_estado = 'cancelado' then
    raise exception 'El pedido está cancelado.';
  end if;

  if v_estado not in ('pendiente_pago', 'pagado') then
    raise exception 'El pedido ya pasó el estado de preparación (estado actual: %)', v_estado;
  end if;

  perform 1
    from productos
    where id in (
      select dp.producto_id from detalle_pedidos dp
      where dp.pedido_id = p_pedido_id and dp.producto_id is not null
      union
      select ci.producto_id from detalle_pedidos dp
      join combo_ingredientes ci on ci.combo_id = dp.combo_id
      where dp.pedido_id = p_pedido_id
    )
    order by id
    for update;

  for v_consumo in
    select dp.stock_insuficiente, dp.producto_id, dp.cantidad * uvp.factor_conversion_base as necesario
    from detalle_pedidos dp
    join unidades_venta_producto uvp on uvp.id = dp.unidad_venta_id
    where dp.pedido_id = p_pedido_id and dp.combo_id is null

    union all

    select dp.stock_insuficiente, ci.producto_id,
           sum(dp.cantidad * ci.factor_cantidad * uvp.factor_conversion_base) as necesario
    from detalle_pedidos dp
    join combo_ingredientes ci on ci.combo_id = dp.combo_id
    join unidades_venta_producto uvp on uvp.id = ci.unidad_venta_id
    where dp.pedido_id = p_pedido_id
    group by dp.id, dp.stock_insuficiente, ci.producto_id
  loop
    if v_consumo.stock_insuficiente then
      select stock_actual_unidad_base into v_stock
        from productos where id = v_consumo.producto_id;

      if v_stock < v_consumo.necesario then
        raise exception
          'No se puede pasar a preparación: falta stock de %. Resolvé el faltante antes de continuar.',
          (select nombre from productos where id = v_consumo.producto_id);
      end if;
    end if;

    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base - v_consumo.necesario
    where id = v_consumo.producto_id;
  end loop;

  update detalle_pedidos
  set stock_insuficiente = false, faltante = null
  where pedido_id = p_pedido_id and stock_insuficiente;

  update pedidos_online set estado = 'en_preparacion' where id = p_pedido_id;
end;
$$;

grant execute on function avanzar_pedido_preparacion(uuid) to authenticated;


-- =========================================================
-- 5) registrar_venta: un item puede traer combo_id en vez de
-- producto_id/unidad_venta_id.
--   - Precio: combos.precio_fijo desde la base; si no coincide con lo que
--     mandó la caja, se rechaza con el mismo mensaje que los productos.
--   - Costo: se calcula acá (suma de costo_vigente de los ingredientes),
--     no se confía en el que manda la caja.
--   - Stock: se descuenta de cada ingrediente. Como en el resto del
--     mostrador, nunca bloquea por stock (puede quedar negativo).
-- Mismos parámetros: la llamada de Cajero.jsx no cambia de forma.
-- Resto idéntico a schema_precio_promocional_cobro.sql.
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
  v_costo numeric;
  v_combo_id uuid;
  v_combo_activo boolean;
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

  -- 2) Por cada item: validar, fijar el precio desde la base, insertar el
  --    detalle y descontar stock
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_combo_id := nullif(v_item->>'combo_id', '')::uuid;

    if v_combo_id is not null then
      -- ---------- Línea de combo ----------
      v_producto_nombre := null;
      select c.sucursal_id, c.nombre, c.precio_fijo, c.activo
        into v_producto_sucursal, v_producto_nombre, v_precio, v_combo_activo
        from combos c
        where c.id = v_combo_id;

      if v_producto_nombre is null then
        raise exception 'El combo % no existe', v_combo_id;
      end if;

      if v_producto_sucursal <> p_sucursal_id then
        raise exception 'El combo % no pertenece a la sucursal de la venta', v_combo_id;
      end if;

      if not v_combo_activo then
        raise exception 'El combo "%" fue desactivado. Recargá la pantalla de caja y volvé a cargar la venta.',
          v_producto_nombre;
      end if;

      if abs(v_precio - (v_item->>'precio_unitario_historico')::numeric) > 0.01 then
        raise exception 'El precio de "%" cambió (ahora $%). Recargá la pantalla de caja y volvé a cargar la venta.',
          v_producto_nombre, v_precio;
      end if;

      select sum(ci.factor_cantidad * uvp.costo_vigente)
        into v_costo
        from combo_ingredientes ci
        join unidades_venta_producto uvp on uvp.id = ci.unidad_venta_id
        where ci.combo_id = v_combo_id;

      if v_costo is null then
        raise exception 'El combo "%" no tiene ingredientes cargados', v_producto_nombre;
      end if;

      perform 1
        from productos
        where id in (select producto_id from combo_ingredientes where combo_id = v_combo_id)
        order by id
        for update;

      v_subtotal := v_cantidad * v_precio
                    - coalesce((v_item->>'descuento_aplicado')::numeric, 0);

      insert into detalle_ventas (
        venta_id, combo_id, cantidad,
        costo_unitario_historico, precio_unitario_historico,
        descuento_aplicado, subtotal
      ) values (
        v_venta_id,
        v_combo_id,
        v_cantidad,
        v_costo,
        v_precio,
        coalesce((v_item->>'descuento_aplicado')::numeric, 0),
        v_subtotal
      );

      update productos p
      set stock_actual_unidad_base = p.stock_actual_unidad_base - v_cantidad * x.consumo
      from (
        select ci.producto_id, sum(ci.factor_cantidad * uvp.factor_conversion_base) as consumo
        from combo_ingredientes ci
        join unidades_venta_producto uvp on uvp.id = ci.unidad_venta_id
        where ci.combo_id = v_combo_id
        group by ci.producto_id
      ) x
      where p.id = x.producto_id;
    else
      -- ---------- Línea de producto (sin cambios) ----------
      -- Como la función bypasea RLS, hay que validar a mano que el
      -- producto pertenezca a la sucursal de la venta
      v_producto_sucursal := null;
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

      update productos
      set stock_actual_unidad_base = stock_actual_unidad_base - v_cantidad * v_factor
      where id = (v_item->>'producto_id')::uuid;
    end if;

    v_total_bruto := v_total_bruto + v_cantidad * v_precio;
    v_total_items_neto := v_total_items_neto + v_subtotal;
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


-- =========================================================
-- 6) vw_historial_movimientos_stock: las líneas de combo tienen
-- producto_id null, así que con los joins de antes desaparecían del
-- historial. Se suman dos ramas que expanden cada combo vendido en un
-- renglón por ingrediente (cantidad en la unidad de venta del
-- ingrediente, igual que las líneas sueltas).
--
-- id_movimiento de esas filas: md5(línea || ingrediente)::uuid -- único
-- y estable (MovimientosStock.jsx usa origen_tabla + id_movimiento como
-- key). motivo_o_referencia es el mismo 'Venta #...' / 'Pedido online
-- #...' que las líneas sueltas, así se agrupan con el resto de la venta.
-- Mismas columnas y tipos que antes (CREATE OR REPLACE VIEW lo exige).
-- =========================================================

create or replace view vw_historial_movimientos_stock
with (security_invoker = true)
as
select
  dv.id as id_movimiento,
  'detalle_ventas'::text as origen_tabla,
  v.fecha_hora as fecha,
  dv.producto_id,
  p.nombre as nombre_producto,
  'salida'::text as tipo,
  dv.cantidad,
  ('Venta #' || v.id::text) as motivo_o_referencia,
  v.usuario_id
from detalle_ventas dv
join ventas v on v.id = dv.venta_id
join productos p on p.id = dv.producto_id

union all

select
  md5(dv.id::text || ci.id::text)::uuid as id_movimiento,
  'detalle_ventas'::text as origen_tabla,
  v.fecha_hora as fecha,
  ci.producto_id,
  p.nombre as nombre_producto,
  'salida'::text as tipo,
  dv.cantidad * ci.factor_cantidad as cantidad,
  ('Venta #' || v.id::text) as motivo_o_referencia,
  v.usuario_id
from detalle_ventas dv
join ventas v on v.id = dv.venta_id
join combo_ingredientes ci on ci.combo_id = dv.combo_id
join productos p on p.id = ci.producto_id

union all

select
  dp.id as id_movimiento,
  'detalle_pedidos'::text as origen_tabla,
  po.fecha_creacion as fecha,
  dp.producto_id,
  p.nombre as nombre_producto,
  'salida'::text as tipo,
  dp.cantidad,
  ('Pedido online #' || po.id::text) as motivo_o_referencia,
  null::uuid as usuario_id
from detalle_pedidos dp
join pedidos_online po on po.id = dp.pedido_id
join productos p on p.id = dp.producto_id
where po.estado in ('en_preparacion', 'en_camino', 'entregado')

union all

select
  md5(dp.id::text || ci.id::text)::uuid as id_movimiento,
  'detalle_pedidos'::text as origen_tabla,
  po.fecha_creacion as fecha,
  ci.producto_id,
  p.nombre as nombre_producto,
  'salida'::text as tipo,
  dp.cantidad * ci.factor_cantidad as cantidad,
  ('Pedido online #' || po.id::text) as motivo_o_referencia,
  null::uuid as usuario_id
from detalle_pedidos dp
join pedidos_online po on po.id = dp.pedido_id
join combo_ingredientes ci on ci.combo_id = dp.combo_id
join productos p on p.id = ci.producto_id
where po.estado in ('en_preparacion', 'en_camino', 'entregado')

union all

select
  dc.id as id_movimiento,
  'detalle_compras'::text as origen_tabla,
  cp.fecha as fecha,
  dc.producto_id,
  p.nombre as nombre_producto,
  'entrada'::text as tipo,
  dc.cantidad,
  ('Compra #' || cp.id::text) as motivo_o_referencia,
  null::uuid as usuario_id
from detalle_compras dc
join compras_proveedor cp on cp.id = dc.compra_id
join productos p on p.id = dc.producto_id
where cp.estado = 'confirmada'

union all

select
  a.id as id_movimiento,
  'ajustes_stock'::text as origen_tabla,
  a.fecha as fecha,
  a.producto_id,
  p.nombre as nombre_producto,
  a.tipo_movimiento as tipo,
  a.cantidad,
  coalesce(nullif(trim(a.motivo), ''), 'Ajuste manual') as motivo_o_referencia,
  a.usuario_id
from ajustes_stock a
join productos p on p.id = a.producto_id;

grant select on vw_historial_movimientos_stock to authenticated;
