-- =========================================================
-- Fix: marcar_pedido_pagado en producción tenía un loop que descontaba
-- stock directamente (código que nunca estuvo en los .sql trackeados
-- del repo -- quedó de una versión anterior que nunca se sincronizó).
-- Combinado con avanzar_pedido_preparacion, esto descontaba el stock
-- DOS veces por pedido: una al marcar "pagado", otra al pasar a
-- "en preparación".
--
-- Este CREATE OR REPLACE reinstala la versión correcta: solo valida y
-- cambia el estado, sin tocar productos para nada. La firma
-- (p_pedido_id uuid) no cambia, así que no hace falta dropear nada.
-- =========================================================

create or replace function marcar_pedido_pagado(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if auth_rol() <> 'dueño' then
    raise exception 'Solo el dueño puede confirmar pagos manualmente';
  end if;

  select estado into v_estado from pedidos_online where id = p_pedido_id;

  if v_estado is null then
    raise exception 'El pedido no existe';
  end if;

  if v_estado <> 'pendiente_pago' then
    raise exception 'El pedido ya no está pendiente de pago (estado actual: %)', v_estado;
  end if;

  update pedidos_online set estado = 'pagado' where id = p_pedido_id;
end;
$$;

grant execute on function marcar_pedido_pagado(uuid) to authenticated;
