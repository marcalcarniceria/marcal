-- =========================================================
-- CAMBIO 1: marcar_pedido_pagado ya no descuenta stock.
--
-- El descuento nunca vivió en esa función -- lo hacía el trigger
-- "de blindaje" trg_pedidos_online_descontar_stock, que disparaba
-- SIEMPRE que un pedido pasaba de 'pendiente_pago' a 'pagado', sin
-- importar qué función hiciera el UPDATE (schema_ecommerce.sql).
-- Confirmé que no hay ninguna otra dependencia de ese trigger (ni en
-- movimientos_dinero, ni en ningún otro lugar del repo) -- es seguro
-- sacarlo entero. marcar_pedido_pagado queda tal cual estaba (ya era
-- puramente informativa: solo cambia el estado).
-- =========================================================

drop trigger if exists trg_pedidos_online_descontar_stock on pedidos_online;
drop function if exists trg_descontar_stock_pedido_online();

-- =========================================================
-- CAMBIO 2: nueva función para la transición a 'en_preparacion'. Acá
-- es donde ahora se descuenta el stock.
--
-- Decisiones no especificadas en el pedido original, para que las
-- puedas corregir si no es lo que querías:
--
-- 1) Quién puede llamarla: dueño, o cualquier staff de la sucursal
--    (mismo criterio que ya usamos para que el cajero pueda ver los
--    pedidos y las notificaciones -- no lo dejé limitado a dueño como
--    marcar_pedido_pagado, porque esta transición es operativa del
--    día a día, no una confirmación de pago sensible).
-- 2) Guarda contra doble descuento: si el pedido ya pasó por
--    'en_preparacion' (o está más adelante, o cancelado), la función
--    rechaza la llamada en vez de volver a descontar stock. Sin esto,
--    seleccionar "en_preparacion" dos veces en el <select> (por
--    error, o volviendo atrás y para adelante) descontaría el stock
--    dos veces.
-- 3) Todo pasa en una sola transacción: si CUALQUIER línea con
--    stock_insuficiente sigue sin alcanzar, se aborta la función
--    entera -- incluidas las líneas que sí se habían empezado a
--    descontar en el mismo loop. Esto es lo que hace que "el pedido
--    se quede como estaba" de verdad (ninguna línea queda a mitad de
--    camino), aprovechando que una excepción en PL/pgSQL revierte
--    todo lo hecho en esa misma invocación (mismo mecanismo que ya
--    usa crear_pedido_online).
-- 4) faltante se recalcula con el stock de AHORA en el mensaje de
--    error (puede ser distinto al que se calculó cuando se creó el
--    pedido, si mientras tanto entró parte de una compra).
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
  v_detalle record;
  v_necesario numeric;
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

  for v_detalle in
    select
      dp.id, dp.producto_id, dp.cantidad, dp.stock_insuficiente,
      p.stock_actual_unidad_base, p.nombre,
      uvp.factor_conversion_base
    from detalle_pedidos dp
    join productos p on p.id = dp.producto_id
    join unidades_venta_producto uvp on uvp.id = dp.unidad_venta_id
    where dp.pedido_id = p_pedido_id
    for update of p
  loop
    v_necesario := v_detalle.cantidad * v_detalle.factor_conversion_base;

    if v_detalle.stock_insuficiente then
      if v_detalle.stock_actual_unidad_base < v_necesario then
        raise exception
          'No se puede pasar a preparación: falta stock de %. Resolvé el faltante antes de continuar.',
          v_detalle.nombre;
      end if;

      update detalle_pedidos
      set stock_insuficiente = false, faltante = null
      where id = v_detalle.id;
    end if;

    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base - v_necesario
    where id = v_detalle.producto_id;
  end loop;

  update pedidos_online set estado = 'en_preparacion' where id = p_pedido_id;
end;
$$;

grant execute on function avanzar_pedido_preparacion(uuid) to authenticated;
