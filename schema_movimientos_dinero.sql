-- =========================================================
-- movimientos_dinero: vista que junta las 4 fuentes de dinero
-- que ya existen (pagos_venta, pagos_fiados, gastos,
-- pagos_proveedor) en una sola grilla de ingresos/egresos, sin
-- duplicar datos en una tabla nueva que se pueda desincronizar.
--
-- Sobre "agregar la política RLS correspondiente sobre la vista":
-- Postgres no tiene ALTER VIEW ... ENABLE ROW LEVEL SECURITY (eso
-- es solo para tablas). El equivalente correcto para una vista es
-- crearla con security_invoker = true (Postgres 15+): hace que la
-- vista se ejecute con los permisos y las policies del usuario que
-- CONSULTA, en vez de con los del dueño de la vista (que por
-- default bypasea RLS). Como las 4 tablas de origen YA tienen
-- exactamente el criterio pedido -- "dueño ve todo, el resto solo
-- su sucursal" (ver rls_setup_cajero.sql para ventas/pagos_venta,
-- rls_setup_compras.sql para pagos_proveedor, rls_setup_fiados_gastos.sql
-- para gastos/pagos_fiados) -- esto logra el mismo filtrado sin
-- inventar una policy nueva ni duplicar el criterio en dos lugares.
--
-- Nota (efecto secundario esperado, no es un bug): `usuarios` tiene
-- su propia RLS -- un cajero solo puede leer su propia fila, no las
-- de otros usuarios. Con security_invoker, eso significa que el
-- motivo de una venta ajena le puede aparecer a un cajero como
-- "Venta - Cajero" genérico en vez del nombre real (el COALESCE ya
-- contempla esto). El dueño siempre ve el nombre real porque su
-- policy sobre usuarios no tiene esa restricción.
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
join proveedores p on p.id = pp.proveedor_id;

grant select on movimientos_dinero to authenticated;
