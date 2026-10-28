-- =========================================================
-- Auditoría de seguridad -- arreglos CRÍTICOS (ver reporte de auditoría).
--
-- Correr COMPLETO en el SQL Editor de Supabase, en una sola ejecución
-- (va dentro de una transacción: si algo falla, no se aplica nada).
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- 1) auth_rol()/auth_sucursal() nunca devuelven NULL
-- 2) Las funciones de staff dejan de ser ejecutables por anon
-- 3) Se elimina el overload viejo de crear_pedido_online (8 args)
-- 4) crear_pedido_online: cantidades, unidad<->producto, largos, cliente
-- 5) CHECKs en la base como segunda barrera
-- =========================================================

begin;

-- =========================================================
-- 1) auth_rol() / auth_sucursal() sin NULL
--
-- Para cualquiera que NO tenga fila en `usuarios` (anon, o un cliente
-- de la tienda logueado) devolvían NULL, y los chequeos del tipo
--   if auth_rol() <> 'dueño' then raise ...
--   if not (auth_rol() = 'dueño' or v_sucursal_id = auth_sucursal()) ...
--   if auth_rol() not in (...) ...
-- evalúan a NULL -> el IF no entra -> el chequeo se SALTEA. Afectaba a
-- todos los reporte_*, admin_listar_usuarios, admin_listar_clientes_web,
-- admin_pedidos_cliente, registrar_venta, marcar_pedido_cobrado,
-- avanzar_pedido_preparacion y rpc_registrar_ajuste_stock.
--
-- Con '' y un uuid "nulo" todas esas comparaciones dan TRUE/FALSE de
-- verdad. Las policies RLS no cambian de comportamiento (NULL = 'dueño'
-- y '' = 'dueño' son ambos "no pasa").
--
-- Además: un empleado desactivado (usuarios.activo = false) pierde el
-- rol al instante, sin esperar a que venza su JWT (hasta 1 hora).
-- =========================================================

create or replace function auth_rol()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select rol from usuarios where id = auth.uid() and activo is not false),
    ''
  );
$$;

create or replace function auth_sucursal()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select sucursal_id from usuarios where id = auth.uid() and activo is not false),
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$;

-- anon las necesita: las policies RLS que las usan se evalúan también
-- cuando anon lee el catálogo.
grant execute on function auth_rol() to anon, authenticated;
grant execute on function auth_sucursal() to anon, authenticated;

-- =========================================================
-- 2) Funciones de staff fuera del alcance de anon
--
-- Postgres le da EXECUTE a PUBLIC en toda función nueva, y Supabase le
-- da EXECUTE a anon por default en el schema public: con la anon key
-- (que está en el bundle de la tienda) cualquiera podía llamar
-- supabase.rpc('admin_listar_clientes_web'). Se revoca a TODAS las
-- funciones de public menos las que la tienda pública necesita.
-- (Defensa en profundidad: el punto 1 ya cierra el bypass; esto evita
-- que un futuro chequeo mal escrito vuelva a abrirlo.)
-- =========================================================

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      -- no tocar funciones que vienen de extensiones
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      -- lo que SÍ usa la tienda pública sin login
      and p.proname not in ('crear_pedido_online', 'obtener_combos_tienda', 'auth_rol', 'auth_sucursal')
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end;
$$;

-- Para las funciones que se creen de acá en adelante.
alter default privileges in schema public revoke execute on functions from public, anon;

-- =========================================================
-- 3) Overload viejo de crear_pedido_online
--
-- schema_pedidos_stock_insuficiente.sql creó la versión de 8 args y
-- ningún archivo posterior la dropea (schema_metodo_pago_entrega_cobro
-- solo dropea la de 10 para recrearla) -> sigue viva, ejecutable por
-- anon y con la lógica vieja. El frontend usa la de 10 args.
-- =========================================================

drop function if exists crear_pedido_online(uuid, uuid, text, text, text, text, jsonb, uuid);

-- =========================================================
-- 4) crear_pedido_online -- versión vigente
--    (schema_costo_historico_pedidos_online.sql) + cambios marcados
--    con [SEGURIDAD]. Misma firma: no hace falta dropear.
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
             p.stock_actual_unidad_base
        into v_producto_sucursal, v_precio, v_costo, v_factor, v_stock
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


grant execute on function crear_pedido_online(uuid, uuid, text, text, text, text, jsonb, uuid, text, text) to anon, authenticated;

-- =========================================================
-- 5) CHECKs como segunda barrera (por si algún otro camino escribe
--    detalle_pedidos). NOT VALID: no revisa filas viejas, solo las
--    nuevas. NaN se excluye explícito porque en Postgres NaN > 0.
-- =========================================================

alter table detalle_pedidos drop constraint if exists detalle_pedidos_cantidad_positiva;
alter table detalle_pedidos
  add constraint detalle_pedidos_cantidad_positiva
  check (cantidad > 0 and cantidad <> 'NaN'::numeric and subtotal >= 0) not valid;

alter table pedidos_online drop constraint if exists pedidos_online_total_no_negativo;
alter table pedidos_online
  add constraint pedidos_online_total_no_negativo
  check (total >= 0 and total <> 'NaN'::numeric) not valid;

commit;
