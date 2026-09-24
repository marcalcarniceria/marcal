-- =========================================================
-- Combos: inmutabilidad histórica de la receta.
-- Requiere schema_combos_ventas.sql.
--
-- Problema: las líneas de combo solo guardaban combo_id, y el stock /
-- historial se calculaban leyendo la receta VIVA (combo_ingredientes).
-- Editar un combo alteraba pedidos pendientes y el inventario pasado.
--
-- Solución: al registrar la línea se copia la receta exacta en una tabla
-- hija, y todo lo que viene después (descuento de stock, historial) lee
-- SOLO esa copia:
--   detalle_pedidos_combo_ingredientes  (hija de detalle_pedidos)
--   detalle_ventas_combo_ingredientes   (hija de detalle_ventas)
--
-- Por qué tablas y no una columna JSONB: el descuento de stock y la vista
-- del historial hacen joins/sumas por producto -- con tablas son joins
-- comunes, con FKs a productos y checks; con JSONB habría que
-- desarmarlo con jsonb_to_recordset en cada lugar y no habría integridad.
--
-- Qué se congela por ingrediente: producto, unidad, factor_cantidad Y el
-- factor_conversion_base de la unidad en ese momento (si mañana se
-- corrige el factor de "Bandeja", las ventas viejas no cambian).
--
-- Consistencia: crear_pedido_online y registrar_venta leen el combo con
-- FOR SHARE. guardar_combo hace UPDATE de esa misma fila antes de tocar
-- los ingredientes, así que no puede editar la receta en medio de una
-- venta: precio, costo, chequeo de stock y copia salen de la misma
-- versión de la receta.
-- =========================================================


-- =========================================================
-- 1) Tablas de snapshot
-- =========================================================

create table if not exists detalle_pedidos_combo_ingredientes (
  id uuid primary key default gen_random_uuid(),
  detalle_pedido_id uuid not null references detalle_pedidos(id) on delete cascade,
  producto_id uuid not null references productos(id),
  unidad_venta_id uuid not null references unidades_venta_producto(id),
  factor_cantidad numeric not null check (factor_cantidad > 0),
  factor_conversion_base numeric not null check (factor_conversion_base > 0)
);

create index if not exists detalle_pedidos_combo_ing_detalle_idx
  on detalle_pedidos_combo_ingredientes (detalle_pedido_id);

create table if not exists detalle_ventas_combo_ingredientes (
  id uuid primary key default gen_random_uuid(),
  detalle_venta_id uuid not null references detalle_ventas(id) on delete cascade,
  producto_id uuid not null references productos(id),
  unidad_venta_id uuid not null references unidades_venta_producto(id),
  factor_cantidad numeric not null check (factor_cantidad > 0),
  factor_conversion_base numeric not null check (factor_conversion_base > 0)
);

create index if not exists detalle_ventas_combo_ing_detalle_idx
  on detalle_ventas_combo_ingredientes (detalle_venta_id);


-- =========================================================
-- 2) RLS: solo lectura, heredada de la línea padre (si podés ver la
-- línea de venta/pedido, podés ver su receta congelada -- la subquery
-- respeta las policies de detalle_ventas / detalle_pedidos). Nadie
-- escribe directo: solo las funciones SECURITY DEFINER de abajo. Es un
-- registro inmutable, igual que ventas.
-- =========================================================

alter table detalle_pedidos_combo_ingredientes enable row level security;

drop policy if exists "detalle_pedidos_combo_ing_select" on detalle_pedidos_combo_ingredientes;
create policy "detalle_pedidos_combo_ing_select"
on detalle_pedidos_combo_ingredientes
for select
using (detalle_pedido_id in (select id from detalle_pedidos));

grant select on detalle_pedidos_combo_ingredientes to authenticated;

alter table detalle_ventas_combo_ingredientes enable row level security;

drop policy if exists "detalle_ventas_combo_ing_select" on detalle_ventas_combo_ingredientes;
create policy "detalle_ventas_combo_ing_select"
on detalle_ventas_combo_ingredientes
for select
using (detalle_venta_id in (select id from detalle_ventas));

grant select on detalle_ventas_combo_ingredientes to authenticated;


-- =========================================================
-- 3) Backfill de las líneas de combo ya registradas (las vendidas entre
-- schema_combos_ventas.sql y este parche). Para ellas no hay otra fuente
-- que la receta actual: se congela la de HOY. Si alguna receta se editó
-- en el medio, esas pocas líneas quedan con la receta nueva -- a partir
-- de acá ya no puede volver a pasar. Solo toca líneas sin snapshot, así
-- que correr el script dos veces no duplica nada.
-- =========================================================

insert into detalle_pedidos_combo_ingredientes (
  detalle_pedido_id, producto_id, unidad_venta_id, factor_cantidad, factor_conversion_base
)
select dp.id, ci.producto_id, ci.unidad_venta_id, ci.factor_cantidad, uvp.factor_conversion_base
from detalle_pedidos dp
join combo_ingredientes ci on ci.combo_id = dp.combo_id
join unidades_venta_producto uvp on uvp.id = ci.unidad_venta_id
where dp.combo_id is not null
  and not exists (
    select 1 from detalle_pedidos_combo_ingredientes s where s.detalle_pedido_id = dp.id
  );

insert into detalle_ventas_combo_ingredientes (
  detalle_venta_id, producto_id, unidad_venta_id, factor_cantidad, factor_conversion_base
)
select dv.id, ci.producto_id, ci.unidad_venta_id, ci.factor_cantidad, uvp.factor_conversion_base
from detalle_ventas dv
join combo_ingredientes ci on ci.combo_id = dv.combo_id
join unidades_venta_producto uvp on uvp.id = ci.unidad_venta_id
where dv.combo_id is not null
  and not exists (
    select 1 from detalle_ventas_combo_ingredientes s where s.detalle_venta_id = dv.id
  );


-- =========================================================
-- 4) crear_pedido_online: la línea de combo ahora
--   - bloquea el combo (FOR SHARE) para leer una sola versión de la receta,
--   - inserta la línea y copia la receta en detalle_pedidos_combo_ingredientes.
-- stock_insuficiente se sigue calculando ANTES del insert (con el combo ya
-- bloqueado, así que es la misma receta que se copia): el aviso en vivo de
-- PedidosStockInsuficienteContext escucha el INSERT con
-- stock_insuficiente = true, un UPDATE posterior no lo dispararía.
-- La línea de producto no cambia.
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
-- 5) avanzar_pedido_preparacion: las líneas de combo consumen
-- ESTRICTAMENTE la receta congelada del pedido
-- (detalle_pedidos_combo_ingredientes, con su factor_conversion_base
-- congelado). combo_ingredientes ya no se lee acá.
-- Resto idéntico a schema_combos_ventas.sql.
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

  -- Una línea de combo sin receta congelada no puede descontar nada: se
  -- corta acá en vez de dejarla pasar sin tocar stock.
  if exists (
    select 1 from detalle_pedidos dp
    where dp.pedido_id = p_pedido_id
      and dp.combo_id is not null
      and not exists (
        select 1 from detalle_pedidos_combo_ingredientes s where s.detalle_pedido_id = dp.id
      )
  ) then
    raise exception 'El pedido tiene un combo sin receta registrada. Revisalo antes de pasarlo a preparación.';
  end if;

  perform 1
    from productos
    where id in (
      select dp.producto_id from detalle_pedidos dp
      where dp.pedido_id = p_pedido_id and dp.producto_id is not null
      union
      select s.producto_id from detalle_pedidos dp
      join detalle_pedidos_combo_ingredientes s on s.detalle_pedido_id = dp.id
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

    select dp.stock_insuficiente, s.producto_id,
           sum(dp.cantidad * s.factor_cantidad * s.factor_conversion_base) as necesario
    from detalle_pedidos dp
    join detalle_pedidos_combo_ingredientes s on s.detalle_pedido_id = dp.id
    where dp.pedido_id = p_pedido_id
    group by dp.id, dp.stock_insuficiente, s.producto_id
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
-- 6) registrar_venta: la línea de combo
--   - bloquea el combo (FOR SHARE): precio, costo y receta de una sola versión,
--   - inserta la línea y copia la receta en detalle_ventas_combo_ingredientes,
--   - descuenta stock desde esa copia (no desde combo_ingredientes).
-- La línea de producto no cambia. Mismos parámetros.
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
  v_detalle_id uuid;
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
        where c.id = v_combo_id
        for share;

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
      )
      returning id into v_detalle_id;

      -- Foto de la receta: desde acá esta venta ya no depende de
      -- combo_ingredientes.
      insert into detalle_ventas_combo_ingredientes (
        detalle_venta_id, producto_id, unidad_venta_id, factor_cantidad, factor_conversion_base
      )
      select v_detalle_id, ci.producto_id, ci.unidad_venta_id, ci.factor_cantidad, uvp.factor_conversion_base
      from combo_ingredientes ci
      join unidades_venta_producto uvp on uvp.id = ci.unidad_venta_id
      where ci.combo_id = v_combo_id;

      perform 1
        from productos
        where id in (
          select producto_id from detalle_ventas_combo_ingredientes where detalle_venta_id = v_detalle_id
        )
        order by id
        for update;

      update productos p
      set stock_actual_unidad_base = p.stock_actual_unidad_base - v_cantidad * x.consumo
      from (
        select s.producto_id, sum(s.factor_cantidad * s.factor_conversion_base) as consumo
        from detalle_ventas_combo_ingredientes s
        where s.detalle_venta_id = v_detalle_id
        group by s.producto_id
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
-- 7) vw_historial_movimientos_stock: las ramas de combo leen la receta
-- congelada de cada línea en vez de combo_ingredientes. Como cada fila
-- de snapshot es propia de UNA línea, su id ya es único y estable: se usa
-- directo como id_movimiento (antes hacía falta md5(línea || ingrediente)).
-- Mismas columnas y tipos que antes.
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
  s.id as id_movimiento,
  'detalle_ventas'::text as origen_tabla,
  v.fecha_hora as fecha,
  s.producto_id,
  p.nombre as nombre_producto,
  'salida'::text as tipo,
  dv.cantidad * s.factor_cantidad as cantidad,
  ('Venta #' || v.id::text) as motivo_o_referencia,
  v.usuario_id
from detalle_ventas dv
join ventas v on v.id = dv.venta_id
join detalle_ventas_combo_ingredientes s on s.detalle_venta_id = dv.id
join productos p on p.id = s.producto_id

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
  s.id as id_movimiento,
  'detalle_pedidos'::text as origen_tabla,
  po.fecha_creacion as fecha,
  s.producto_id,
  p.nombre as nombre_producto,
  'salida'::text as tipo,
  dp.cantidad * s.factor_cantidad as cantidad,
  ('Pedido online #' || po.id::text) as motivo_o_referencia,
  null::uuid as usuario_id
from detalle_pedidos dp
join pedidos_online po on po.id = dp.pedido_id
join detalle_pedidos_combo_ingredientes s on s.detalle_pedido_id = dp.id
join productos p on p.id = s.producto_id
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
