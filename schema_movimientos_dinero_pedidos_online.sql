-- =========================================================
-- movimientos_dinero no incluía los ingresos de pedidos_online (la
-- tienda online) -- solo contemplaba pagos_venta, pagos_fiados, gastos
-- y pagos_proveedor, las fuentes del circuito de mostrador/caja. La
-- plata que entra por un pedido online marcado "pagado" nunca aparecía
-- en la pantalla de Movimientos de Dinero.
--
-- pedidos_online no tenía ningún campo que registrara CUÁNDO se marcó
-- como pagado -- solo fecha_creacion (fecha en que se creó el pedido,
-- que puede ser un día distinto al que se confirma el pago). Este
-- archivo agrega fecha_pago y la centraliza en marcar_pedido_pagado
-- (mismo lugar donde el día de mañana se conecte el webhook real de
-- Mercado Pago).
-- =========================================================

alter table pedidos_online
  add column if not exists fecha_pago timestamptz;

-- Backfill para pedidos ya existentes que están en pagado o más
-- avanzado: no tenemos el dato real de cuándo se cobraron, así que
-- fecha_creacion es la mejor aproximación disponible (decisión
-- confirmada). Solo toca filas que todavía tienen fecha_pago null,
-- así que correr esto de nuevo no pisa nada.
update pedidos_online
set fecha_pago = fecha_creacion
where estado in ('pagado', 'en_preparacion', 'en_camino', 'entregado')
  and fecha_pago is null;

-- =========================================================
-- marcar_pedido_pagado: misma firma y misma lógica que el fix anterior
-- (schema_fix_doble_descuento_stock.sql -- sigue sin tocar stock para
-- nada), solo se agrega fecha_pago = now() en el mismo update que
-- cambia el estado.
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

  update pedidos_online
  set estado = 'pagado', fecha_pago = now()
  where id = p_pedido_id;
end;
$$;

grant execute on function marcar_pedido_pagado(uuid) to authenticated;

-- =========================================================
-- movimientos_dinero: se agrega la 5ta fuente (pedidos_online) con el
-- mismo patrón UNION ALL. Solo pagado/en_preparacion/en_camino/
-- entregado -- pendiente_pago todavía no se cobró, cancelado no se
-- concretó. cliente_nombre ya es un campo obligatorio en pedidos_online
-- (se completa siempre, tanto en checkout de invitado como logueado),
-- así que no hace falta joinear clientes_web para el motivo.
--
-- security_invoker = true (igual que antes) respeta la RLS de
-- pedidos_online: pedidos_online_select_staff ya cubre "dueño ve todo,
-- sucursal_id = auth_sucursal() para el resto del staff", el mismo
-- criterio que las otras 4 fuentes.
-- =========================================================

create or replace view movimientos_dinero
with (security_invoker = true)
as
select
  pv.id as id,
  'ingreso' as tipo,
  v.fecha_hora as fecha,
  pv.monto as monto,
  'Venta - ' || coalesce(u.nombre, 'Cajero') as motivo,
  v.sucursal_id as sucursal_id
from pagos_venta pv
join ventas v on v.id = pv.venta_id
left join usuarios u on u.id = v.usuario_id
where v.estado = 'activa'

union all

select
  pf.id,
  'ingreso',
  pf.fecha,
  pf.monto,
  'Cobro de fiado - ' || cf.nombre,
  pf.sucursal_id
from pagos_fiados pf
join clientes_fiados cf on cf.id = pf.cliente_fiado_id

union all

select
  g.id,
  'egreso',
  g.fecha,
  g.monto,
  'Gasto - ' || g.concepto,
  g.sucursal_id
from gastos g

union all

select
  pp.id,
  'egreso',
  pp.fecha,
  pp.monto,
  'Pago a proveedor - ' || p.nombre,
  pp.sucursal_id
from pagos_proveedor pp
join proveedores p on p.id = pp.proveedor_id

union all

select
  po.id,
  'ingreso',
  po.fecha_pago,
  po.total::numeric(12,2),
  'Pedido online - ' || po.cliente_nombre,
  po.sucursal_id
from pedidos_online po
where po.estado in ('pagado', 'en_preparacion', 'en_camino', 'entregado');

grant select on movimientos_dinero to authenticated;
