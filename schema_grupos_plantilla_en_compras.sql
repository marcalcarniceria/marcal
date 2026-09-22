-- =========================================================
-- Agrupar líneas de compra que vienen de una plantilla de despiece
-- (ej. "media vaca") en un solo renglón al confirmar la compra, con un
-- solo precio total -- en vez de mostrar cada corte por separado
-- pidiendo un precio individual (que no existe: el proveedor te cobra
-- la media vaca entera, no cada corte suelto).
--
-- Diseño: cada aplicación de una plantilla dentro de un pedido queda
-- registrada en detalle_compras_grupos (qué plantilla, qué peso total).
-- Las líneas de detalle_compras que salen de esa plantilla (una por
-- corte, con la cantidad ya fija según los porcentajes) se linkean a
-- ese grupo vía detalle_compras.grupo_id. Los productos sueltos
-- cargados a mano siguen exactamente igual que antes, con
-- grupo_id = null.
--
-- Un mismo pedido puede tener varios grupos (varias plantillas) y/o
-- productos sueltos mezclados -- se confirmó explícitamente que hace
-- falta soportar esa mezcla, no solo "una plantilla = una compra".
-- =========================================================

create table if not exists detalle_compras_grupos (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references compras_proveedor(id),
  plantilla_id uuid not null references plantillas_despiece(id),
  nombre text not null,
  peso_total numeric not null,
  costo_total numeric
);

alter table detalle_compras
  add column if not exists grupo_id uuid references detalle_compras_grupos(id);

alter table detalle_compras_grupos enable row level security;

-- Mismo criterio que detalle_compras (rls_setup_compras.sql): se filtra
-- a través de la compra asociada.
drop policy if exists "detalle_compras_grupos_select" on detalle_compras_grupos;
create policy "detalle_compras_grupos_select"
on detalle_compras_grupos
for select
using (
  auth_rol() = 'dueño'
  or compra_id in (select id from compras_proveedor where sucursal_id = auth_sucursal())
);

drop policy if exists "detalle_compras_grupos_write_dueno" on detalle_compras_grupos;
create policy "detalle_compras_grupos_write_dueno"
on detalle_compras_grupos
for all
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

-- =========================================================
-- Limpieza de un bug mío de la migración anterior
-- (schema_pagos_proveedor_en_confirmar_compra.sql): le agregué un
-- parámetro nuevo a confirmar_pedido_compra/registrar_compra/
-- registrar_compra_por_plantilla con un simple CREATE OR REPLACE, pero
-- en Postgres eso NO reemplaza la función si cambia la cantidad de
-- parámetros -- crea una función SUPERPUESTA nueva y deja la vieja
-- viva al lado (mismo problema que ya habíamos visto con
-- crear_pedido_online en schema_pedidos_online_cliente_web.sql, donde
-- sí se hizo el DROP correctamente). Como el frontend llama con todos
-- los parámetros nombrados, en la práctica seguía funcionando bien,
-- pero quedaban funciones viejas sin usar dando vueltas en la base.
-- Se limpian acá, junto con el cambio de firma de esta migración.
-- =========================================================

drop function if exists confirmar_pedido_compra(uuid, jsonb);
drop function if exists confirmar_pedido_compra(uuid, jsonb, uuid);
drop function if exists crear_pedido_compra(uuid, uuid, jsonb);
drop function if exists registrar_compra(uuid, uuid, jsonb);
drop function if exists registrar_compra_por_plantilla(uuid, uuid, uuid, numeric, numeric);

-- =========================================================
-- crear_pedido_compra: se agrega p_grupos (default '[]', al final para
-- no romper llamadas viejas de 3 argumentos). Cada elemento es
-- { plantilla_id, peso_total }. Por cada grupo: crea la fila en
-- detalle_compras_grupos y explota los cortes en detalle_compras
-- (mismo cálculo de cantidad que registrar_compra_por_plantilla:
-- peso_total * porcentaje_rendimiento / 100), linkeados por grupo_id,
-- SIN costo todavía -- el costo se carga una sola vez para todo el
-- grupo en confirmar_pedido_compra.
-- =========================================================

create or replace function crear_pedido_compra(
  p_sucursal_id uuid,
  p_proveedor_id uuid,
  p_items jsonb,
  p_grupos jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_compra_id uuid;
  v_grupo jsonb;
  v_grupo_id uuid;
  v_peso_total numeric;
  v_plantilla_id uuid;
  v_plantilla_nombre text;
  v_detalle record;
  v_cantidad numeric;
  v_unidad_id uuid;
  v_lineas int;
begin
  if p_sucursal_id is null then
    raise exception 'p_sucursal_id es obligatorio';
  end if;

  if p_proveedor_id is null then
    raise exception 'p_proveedor_id es obligatorio';
  end if;

  if (p_items is null or jsonb_array_length(p_items) = 0)
     and (p_grupos is null or jsonb_array_length(p_grupos) = 0) then
    raise exception 'El pedido necesita al menos un item o una plantilla';
  end if;

  insert into compras_proveedor (sucursal_id, proveedor_id, fecha, monto_total, estado)
  values (p_sucursal_id, p_proveedor_id, now(), 0, 'pedido')
  returning id into v_compra_id;

  if p_items is not null and jsonb_array_length(p_items) > 0 then
    insert into detalle_compras (compra_id, producto_id, unidad_venta_id, cantidad)
    select
      v_compra_id,
      (elem->>'producto_id')::uuid,
      (elem->>'unidad_venta_id')::uuid,
      (elem->>'cantidad')::numeric
    from jsonb_array_elements(p_items) as elem;
  end if;

  if p_grupos is not null and jsonb_array_length(p_grupos) > 0 then
    for v_grupo in select * from jsonb_array_elements(p_grupos)
    loop
      v_plantilla_id := (v_grupo->>'plantilla_id')::uuid;
      v_peso_total := (v_grupo->>'peso_total')::numeric;

      if v_plantilla_id is null then
        raise exception 'Falta la plantilla en uno de los grupos';
      end if;

      if v_peso_total is null or v_peso_total <= 0 then
        raise exception 'El peso total del grupo debe ser mayor a cero';
      end if;

      select nombre into v_plantilla_nombre
        from plantillas_despiece where id = v_plantilla_id;

      if v_plantilla_nombre is null then
        raise exception 'La plantilla % no existe', v_plantilla_id;
      end if;

      select count(*) into v_lineas
        from plantillas_despiece_detalle where plantilla_id = v_plantilla_id;

      if v_lineas = 0 then
        raise exception 'La plantilla % no tiene productos destino cargados', v_plantilla_nombre;
      end if;

      -- nombre queda "congelado" acá (copiado al momento de crear el
      -- pedido) -- si alguien renombra la plantilla después, esta
      -- compra ya confirmada no cambia retroactivamente.
      insert into detalle_compras_grupos (compra_id, plantilla_id, nombre, peso_total)
      values (v_compra_id, v_plantilla_id, v_plantilla_nombre, v_peso_total)
      returning id into v_grupo_id;

      for v_detalle in
        select producto_destino_id, porcentaje_rendimiento
        from plantillas_despiece_detalle
        where plantilla_id = v_plantilla_id
      loop
        v_cantidad := v_peso_total * v_detalle.porcentaje_rendimiento / 100;

        select uvp.id into v_unidad_id
          from unidades_venta_producto uvp
          where uvp.producto_id = v_detalle.producto_destino_id
          order by abs(uvp.factor_conversion_base - 1) asc
          limit 1;

        if v_unidad_id is null then
          raise exception 'El producto destino % no tiene ninguna unidad de venta cargada', v_detalle.producto_destino_id;
        end if;

        insert into detalle_compras (compra_id, producto_id, unidad_venta_id, cantidad, grupo_id)
        values (v_compra_id, v_detalle.producto_destino_id, v_unidad_id, v_cantidad, v_grupo_id);
      end loop;
    end loop;
  end if;

  return v_compra_id;
end;
$$;

grant execute on function crear_pedido_compra(uuid, uuid, jsonb, jsonb) to authenticated;

-- =========================================================
-- confirmar_pedido_compra: se agrega p_grupos (antes de
-- p_metodo_pago_id, que ya existía). Cada elemento es
-- { grupo_id, costo_total }: el precio TOTAL pagado por todo el grupo
-- (ej. lo que salió la media vaca entera), no por corte.
--
-- Las líneas sueltas (grupo_id is null) se siguen reemplazando enteras
-- a partir de p_items, exactamente como antes -- el sidebar puede
-- seguir agregando/editando/quitando esas libremente. Las líneas de un
-- grupo NO se tocan/reemplazan -- ya quedaron fijas (cantidad por
-- corte) al crear el pedido; acá solo se les completa costo_unitario/
-- subtotal repartiendo el costo_total del grupo según
-- costo_por_kilo = costo_total / peso_total (mismo cálculo que
-- registrar_compra_por_plantilla), y se actualiza stock/costo_vigente/
-- historial_precios igual que para una línea suelta.
--
-- Validación: la cantidad de grupos recibidos en p_grupos tiene que
-- coincidir con la cantidad de grupos que existen para esta compra --
-- no se puede confirmar dejando algún grupo sin precio.
-- =========================================================

create or replace function confirmar_pedido_compra(
  p_compra_id uuid,
  p_items jsonb,
  p_grupos jsonb default '[]'::jsonb,
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
  v_grupo jsonb;
  v_grupo_id uuid;
  v_costo_total_grupo numeric;
  v_peso_total_grupo numeric;
  v_costo_por_kilo numeric;
  v_grupos_existentes int;
  v_grupos_recibidos int;
  v_linea jsonb;
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

  select count(*) into v_grupos_existentes
    from detalle_compras_grupos where compra_id = p_compra_id;

  v_grupos_recibidos := coalesce(jsonb_array_length(p_grupos), 0);

  if v_grupos_existentes <> v_grupos_recibidos then
    raise exception 'Faltan precios de algún grupo (plantilla) de esta compra';
  end if;

  if (p_items is null or jsonb_array_length(p_items) = 0) and v_grupos_existentes = 0 then
    raise exception 'La compra necesita al menos un item';
  end if;

  if p_items is not null then
    for v_elem in select * from jsonb_array_elements(p_items)
    loop
      if (v_elem->>'costo_unitario') is null or (v_elem->>'costo_unitario')::numeric <= 0 then
        raise exception 'Todas las líneas necesitan un costo mayor a cero';
      end if;
    end loop;
  end if;

  if p_grupos is not null then
    for v_grupo in select * from jsonb_array_elements(p_grupos)
    loop
      if (v_grupo->>'costo_total') is null or (v_grupo->>'costo_total')::numeric <= 0 then
        raise exception 'Todos los grupos necesitan un costo total mayor a cero';
      end if;
    end loop;
  end if;

  -- Solo se reemplazan las líneas sueltas -- las de un grupo (plantilla)
  -- no se tocan acá, ver comentario arriba de la función.
  delete from detalle_compras where compra_id = p_compra_id and grupo_id is null;

  if p_items is not null then
    for v_elem in select * from jsonb_array_elements(p_items)
    loop
      v_subtotal := (v_elem->>'cantidad')::numeric * (v_elem->>'costo_unitario')::numeric;

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
  end if;

  if p_grupos is not null then
    for v_grupo in select * from jsonb_array_elements(p_grupos)
    loop
      v_grupo_id := (v_grupo->>'grupo_id')::uuid;
      v_costo_total_grupo := (v_grupo->>'costo_total')::numeric;

      select peso_total into v_peso_total_grupo
        from detalle_compras_grupos
        where id = v_grupo_id and compra_id = p_compra_id;

      if v_peso_total_grupo is null then
        raise exception 'El grupo % no existe en esta compra', v_grupo_id;
      end if;

      v_costo_por_kilo := v_costo_total_grupo / v_peso_total_grupo;

      update detalle_compras_grupos
      set costo_total = v_costo_total_grupo
      where id = v_grupo_id;

      for v_linea in (
        select jsonb_build_object(
          'id', dc.id,
          'producto_id', dc.producto_id,
          'unidad_venta_id', dc.unidad_venta_id,
          'cantidad', dc.cantidad
        )
        from detalle_compras dc
        where dc.grupo_id = v_grupo_id
      )
      loop
        update detalle_compras
        set costo_unitario = v_costo_por_kilo,
            subtotal = (v_linea->>'cantidad')::numeric * v_costo_por_kilo
        where id = (v_linea->>'id')::uuid;

        select uvp.factor_conversion_base, uvp.costo_vigente, uvp.precio_venta
          into v_factor, v_costo_anterior, v_precio_actual
          from unidades_venta_producto uvp
          where uvp.id = (v_linea->>'unidad_venta_id')::uuid;

        update productos
        set stock_actual_unidad_base = stock_actual_unidad_base + (v_linea->>'cantidad')::numeric * v_factor,
            fecha_ultimo_ingreso = current_date
        where id = (v_linea->>'producto_id')::uuid;

        if v_costo_anterior is distinct from v_costo_por_kilo then
          insert into historial_precios (
            unidad_venta_id, precio_anterior, precio_nuevo,
            costo_anterior, costo_nuevo, fecha_cambio
          ) values (
            (v_linea->>'unidad_venta_id')::uuid,
            v_precio_actual, v_precio_actual,
            v_costo_anterior, v_costo_por_kilo, now()
          );

          update unidades_venta_producto
          set costo_vigente = v_costo_por_kilo
          where id = (v_linea->>'unidad_venta_id')::uuid;
        end if;
      end loop;
    end loop;
  end if;

  select coalesce(sum(subtotal), 0) into v_monto_total
    from detalle_compras where compra_id = p_compra_id;

  update compras_proveedor
  set estado = 'confirmada',
      monto_total = v_monto_total
  where id = p_compra_id;

  v_metodo_pago_id := coalesce(
    p_metodo_pago_id,
    (select id from metodos_pago where lower(nombre) = 'efectivo' limit 1),
    (select id from metodos_pago order by nombre limit 1)
  );

  insert into pagos_proveedor (sucursal_id, proveedor_id, monto, fecha, metodo_pago_id)
  values (v_sucursal_id, v_proveedor_id, v_monto_total, now(), v_metodo_pago_id);
end;
$$;

grant execute on function confirmar_pedido_compra(uuid, jsonb, jsonb, uuid) to authenticated;
