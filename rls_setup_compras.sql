-- =========================================================
-- proveedores
-- =========================================================

alter table proveedores enable row level security;

drop policy if exists "proveedores_select" on proveedores;
create policy "proveedores_select"
on proveedores
for select
using (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
);

drop policy if exists "proveedores_write_dueno" on proveedores;
create policy "proveedores_write_dueno"
on proveedores
for all
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

-- =========================================================
-- compras_proveedor
-- =========================================================

alter table compras_proveedor enable row level security;

drop policy if exists "compras_proveedor_select" on compras_proveedor;
create policy "compras_proveedor_select"
on compras_proveedor
for select
using (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
);

drop policy if exists "compras_proveedor_write_dueno" on compras_proveedor;
create policy "compras_proveedor_write_dueno"
on compras_proveedor
for all
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

-- =========================================================
-- detalle_compras (se filtra a través de la compra asociada)
-- =========================================================

alter table detalle_compras enable row level security;

drop policy if exists "detalle_compras_select" on detalle_compras;
create policy "detalle_compras_select"
on detalle_compras
for select
using (
  auth_rol() = 'dueño'
  or compra_id in (select id from compras_proveedor where sucursal_id = auth_sucursal())
);

drop policy if exists "detalle_compras_write_dueno" on detalle_compras;
create policy "detalle_compras_write_dueno"
on detalle_compras
for all
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

-- =========================================================
-- pagos_proveedor (cuenta corriente, sin compra_id; se maneja
-- en una pantalla aparte más adelante — por ahora solo dueño)
-- =========================================================

alter table pagos_proveedor enable row level security;

drop policy if exists "pagos_proveedor_select" on pagos_proveedor;
create policy "pagos_proveedor_select"
on pagos_proveedor
for select
using (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
);

drop policy if exists "pagos_proveedor_write_dueno" on pagos_proveedor;
create policy "pagos_proveedor_write_dueno"
on pagos_proveedor
for all
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

-- =========================================================
-- historial_precios (se filtra a través de unidades_venta_producto -> productos)
-- =========================================================

alter table historial_precios enable row level security;

drop policy if exists "historial_precios_select" on historial_precios;
create policy "historial_precios_select"
on historial_precios
for select
using (
  auth_rol() = 'dueño'
  or unidad_venta_id in (
    select uvp.id
    from unidades_venta_producto uvp
    join productos p on p.id = uvp.producto_id
    where p.sucursal_id = auth_sucursal()
  )
);

drop policy if exists "historial_precios_write_dueno" on historial_precios;
create policy "historial_precios_write_dueno"
on historial_precios
for all
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');
