-- =========================================================
-- Promociones por volumen: "llevando 2 Kg te cobro $X".
--
-- Cada promo vive en la unidad de venta. Se aplica por tandas enteras y el
-- resto va al precio normal: con 2 Kg x $3999 y $2500 el kilo, 5 Kg son
-- 2 x $3999 + 1 x $2500.
--
-- Hay que actualizar crear_pedido_online porque el total del pedido y el
-- cobro de Mercado Pago salen de ahí, no del carrito del navegador. La
-- función es la versión vigente de security_fix_criticos.sql más la promo.
--
-- cantidad_promocion admite hasta 3 decimales: el carrito hace la cuenta en
-- milésimas para no arrastrar errores de punto flotante, y tiene que dar
-- exactamente lo mismo que acá.
--
-- Requiere schema_precio_anterior.sql. Hay que correr esto ANTES de desplegar
-- el frontend: el formulario de Productos ya manda las columnas al guardar.
-- =========================================================

begin;

alter table unidades_venta_producto
  add column if not exists cantidad_promocion numeric,
  add column if not exists precio_promocion_volumen numeric;

alter table unidades_venta_producto
  drop constraint if exists unidades_venta_promocion_volumen_check;

alter table unidades_venta_producto
  add constraint unidades_venta_promocion_volumen_check
  check (
    (cantidad_promocion is null and precio_promocion_volumen is null)
    or (
      cantidad_promocion is not null
      and precio_promocion_volumen is not null
      and cantidad_promocion > 0
      and cantidad_promocion <> 'NaN'::numeric
      and cantidad_promocion = round(cantidad_promocion, 3)
      and precio_promocion_volumen > 0
      and precio_promocion_volumen <> 'NaN'::numeric
    )
  );

-- La tienda lee de esta vista, no de la tabla. Conserva los permisos que ya tiene.
create or replace view catalogo_unidades as
select
  id,
  producto_id,
  nombre_unidad,
  precio_venta,
  precio_promocional,
  precio_anterior,
  cantidad_promocion,
  precio_promocion_volumen
from unidades_venta_producto;

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
  v_cantidad_promocion numeric;
  v_precio_promocion_volumen numeric;
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

  -- [SEGURIDAD] Límites de largo: la función es pública (anon), sin esto
  -- se pueden guardar textos de megabytes en notas/nombre.
  if length(p_cliente_nombre) > 120 or length(p_cliente_telefono) > 30
     or length(coalesce(p_direccion_envio, '')) > 250 or length(coalesce(p_notas, '')) > 500 then
    raise exception 'Algún dato del pedido es demasiado largo';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'El pedido tiene demasiados items';
  end if;

  -- [SEGURIDAD] El pedido solo se puede asociar a la cuenta de quien lo
  -- hace -- antes cualquiera podía mandar el id de otro cliente.
  if p_cliente_web_id is not null and p_cliente_web_id is distinct from auth.uid() then
    raise exception 'No autorizado';
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

    -- [SEGURIDAD] Cantidades negativas restaban al total (y sumaban stock
    -- al confirmar); 'NaN' es un numeric válido en Postgres.
    if v_cantidad is null or v_cantidad = 'NaN'::numeric or v_cantidad <= 0 or v_cantidad > 200 then
      raise exception 'Cantidad inválida';
    end if;

    if v_combo_id is not null and v_cantidad <> trunc(v_cantidad) then
      raise exception 'La cantidad de un combo tiene que ser entera';
    end if;

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
             p.stock_actual_unidad_base,
             uvp.cantidad_promocion,
             uvp.precio_promocion_volumen
        into v_producto_sucursal, v_precio, v_costo, v_factor, v_stock,
             v_cantidad_promocion, v_precio_promocion_volumen
        from productos p
        join unidades_venta_producto uvp on uvp.id = (v_item->>'unidad_venta_id')::uuid
        where p.id = (v_item->>'producto_id')::uuid
          -- [SEGURIDAD] la unidad TIENE que ser de ese producto: antes se
          -- podía pedir un producto caro con el precio de la unidad de
          -- otro producto barato.
          and uvp.producto_id = p.id
          and p.activo = true;

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

      -- Promo por volumen: misma cuenta que subtotalLinea en precios.js. Solo
      -- rige si conviene frente al precio normal, así una baja de precios no
      -- deja a nadie pagando de más por llevar más.
      if v_cantidad_promocion is not null
         and v_precio_promocion_volumen < v_cantidad_promocion * v_precio
         and v_cantidad >= v_cantidad_promocion then
        v_subtotal := div(v_cantidad, v_cantidad_promocion) * v_precio_promocion_volumen
                      + mod(v_cantidad, v_cantidad_promocion) * v_precio;
        -- precio_unitario queda como precio promedio: los reportes calculan
        -- la ganancia con (precio_unitario - costo) * cantidad.
        v_precio := round(v_subtotal / v_cantidad, 4);
      else
        v_subtotal := v_cantidad * v_precio;
      end if;

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


grant execute on function crear_pedido_online(uuid, uuid, text, text, text, text, jsonb, uuid, text, text) to anon, authenticated;

commit;

-- PostgREST cachea el schema: sin esto las columnas nuevas pueden tardar en
-- aparecer en la API.
notify pgrst, 'reload schema';
