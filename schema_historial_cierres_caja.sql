-- =========================================================
-- historial_cierres_caja: vista para la grilla de la derecha en
-- CierreCaja.jsx. Por cada cierre YA CERRADO (fecha_cierre not null),
-- calcula la diferencia con la MISMA fórmula que ya usa el formulario
-- de la izquierda de esa pantalla (total esperado en caja = apertura +
-- ventas en efectivo + cobros a fiados en efectivo - gastos en
-- efectivo - pagos a proveedores en efectivo), para que ambas columnas
-- sean consistentes entre sí -- ver nota en CierreCaja.jsx sobre el bug
-- ya corregido de "faltante falso" cuando no se contemplaban fiados/
-- pagos a proveedores en efectivo.
--
-- security_invoker = true (mismo criterio que movimientos_dinero en
-- schema_movimientos_dinero.sql): la vista respeta el RLS real de
-- cierres_caja/ventas/gastos/etc. para quien consulta, en vez de
-- correr con los permisos de quien la creó.
-- =========================================================

-- No se encontró ningún .sql versionado que configure RLS para
-- cierres_caja (a diferencia de casi todas las demás tablas), aunque
-- el acceso anónimo ya viene bloqueado -- probablemente se configuró
-- a mano en el dashboard en algún momento. Se agrega acá de forma
-- segura (drop + create) con el mismo criterio que el resto de la
-- app, para que la vista funcione sin depender de esa incertidumbre.
alter table cierres_caja enable row level security;

drop policy if exists "cierres_caja_select" on cierres_caja;
create policy "cierres_caja_select"
on cierres_caja
for select
using (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
);

create or replace view historial_cierres_caja
with (security_invoker = true)
as
select
  cc.id,
  cc.sucursal_id,
  cc.fecha,
  cc.monto_apertura,
  cc.monto_cierre_declarado,
  cc.fecha_cierre,
  coalesce(ve.total, 0) as ventas_efectivo,
  coalesce(fi.total, 0) as fiados_efectivo,
  coalesce(ga.total, 0) as gastos_efectivo,
  coalesce(pp.total, 0) as pagos_proveedor_efectivo,
  cc.monto_cierre_declarado - (
    cc.monto_apertura
    + coalesce(ve.total, 0)
    + coalesce(fi.total, 0)
    - coalesce(ga.total, 0)
    - coalesce(pp.total, 0)
  ) as diferencia
from cierres_caja cc
left join lateral (
  select sum(pv.monto) as total
  from ventas v
  join pagos_venta pv on pv.venta_id = v.id
  join metodos_pago mp on mp.id = pv.metodo_pago_id
  where v.sucursal_id = cc.sucursal_id
    and v.estado = 'activa'
    and mp.nombre = 'Efectivo'
    and v.fecha_hora >= cc.fecha::timestamptz
    and v.fecha_hora < (cc.fecha + 1)::timestamptz
) ve on true
left join lateral (
  select sum(pf.monto) as total
  from pagos_fiados pf
  join metodos_pago mp on mp.id = pf.metodo_pago_id
  where pf.sucursal_id = cc.sucursal_id
    and mp.nombre = 'Efectivo'
    and pf.fecha >= cc.fecha::timestamptz
    and pf.fecha < (cc.fecha + 1)::timestamptz
) fi on true
left join lateral (
  select sum(g.monto) as total
  from gastos g
  join metodos_pago mp on mp.id = g.metodo_pago_id
  where g.sucursal_id = cc.sucursal_id
    and mp.nombre = 'Efectivo'
    and g.fecha >= cc.fecha::timestamptz
    and g.fecha < (cc.fecha + 1)::timestamptz
) ga on true
left join lateral (
  select sum(pp2.monto) as total
  from pagos_proveedor pp2
  join metodos_pago mp on mp.id = pp2.metodo_pago_id
  where pp2.sucursal_id = cc.sucursal_id
    and mp.nombre = 'Efectivo'
    and pp2.fecha >= cc.fecha::timestamptz
    and pp2.fecha < (cc.fecha + 1)::timestamptz
) pp on true
where cc.fecha_cierre is not null;

grant select on historial_cierres_caja to authenticated;
