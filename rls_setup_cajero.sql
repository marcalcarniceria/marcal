-- =========================================================
-- Funciones helper (no existían en la base — se crean ahora)
-- SECURITY DEFINER: corren con privilegios elevados para poder
-- leer la tabla `usuarios` sin quedar atrapadas por el propio RLS
-- de esa tabla (evita el problema de "circularidad").
-- =========================================================

create or replace function auth_rol()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select rol from usuarios where id = auth.uid();
$$;

create or replace function auth_sucursal()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select sucursal_id from usuarios where id = auth.uid();
$$;

grant execute on function auth_rol() to authenticated;
grant execute on function auth_sucursal() to authenticated;

-- =========================================================
-- usuarios
-- (ya existe la policy "usuarios_select_propio" agregada antes;
--  esto suma que el dueño pueda ver a todos los usuarios)
-- =========================================================

alter table usuarios enable row level security;

drop policy if exists "usuarios_select_dueno" on usuarios;
create policy "usuarios_select_dueno"
on usuarios
for select
using (auth_rol() = 'dueño');

-- =========================================================
-- productos
-- =========================================================

alter table productos enable row level security;

drop policy if exists "productos_select" on productos;
create policy "productos_select"
on productos
for select
using (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
);

drop policy if exists "productos_update_stock" on productos;
create policy "productos_update_stock"
on productos
for update
using (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
)
with check (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
);

drop policy if exists "productos_insert_dueno" on productos;
create policy "productos_insert_dueno"
on productos
for insert
with check (auth_rol() = 'dueño');

drop policy if exists "productos_delete_dueno" on productos;
create policy "productos_delete_dueno"
on productos
for delete
using (auth_rol() = 'dueño');

-- =========================================================
-- unidades_venta_producto
-- (no tiene sucursal_id propio: se filtra por el producto asociado)
-- =========================================================

alter table unidades_venta_producto enable row level security;

drop policy if exists "unidades_venta_select" on unidades_venta_producto;
create policy "unidades_venta_select"
on unidades_venta_producto
for select
using (
  auth_rol() = 'dueño'
  or producto_id in (
    select id from productos where sucursal_id = auth_sucursal()
  )
);

drop policy if exists "unidades_venta_write_dueno" on unidades_venta_producto;
create policy "unidades_venta_write_dueno"
on unidades_venta_producto
for all
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

-- =========================================================
-- metodos_pago (tabla global, sin sucursal_id)
-- =========================================================

alter table metodos_pago enable row level security;

drop policy if exists "metodos_pago_select" on metodos_pago;
create policy "metodos_pago_select"
on metodos_pago
for select
using (auth.role() = 'authenticated');

drop policy if exists "metodos_pago_write_dueno" on metodos_pago;
create policy "metodos_pago_write_dueno"
on metodos_pago
for all
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

-- =========================================================
-- ventas
-- =========================================================

alter table ventas enable row level security;

drop policy if exists "ventas_select" on ventas;
create policy "ventas_select"
on ventas
for select
using (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
);

drop policy if exists "ventas_insert" on ventas;
create policy "ventas_insert"
on ventas
for insert
with check (
  usuario_id = auth.uid()
  and (auth_rol() = 'dueño' or sucursal_id = auth_sucursal())
);

-- Sin policy de UPDATE/DELETE: nadie puede modificar una venta
-- desde el cliente. La anulación se hace vía Edge Function
-- "anular_venta" (usa la service/secret key, que bypassea RLS).

-- =========================================================
-- detalle_ventas (se filtra a través de la venta asociada)
-- =========================================================

alter table detalle_ventas enable row level security;

drop policy if exists "detalle_ventas_select" on detalle_ventas;
create policy "detalle_ventas_select"
on detalle_ventas
for select
using (
  auth_rol() = 'dueño'
  or venta_id in (select id from ventas where sucursal_id = auth_sucursal())
);

drop policy if exists "detalle_ventas_insert" on detalle_ventas;
create policy "detalle_ventas_insert"
on detalle_ventas
for insert
with check (
  venta_id in (
    select id from ventas
    where usuario_id = auth.uid()
      and (auth_rol() = 'dueño' or sucursal_id = auth_sucursal())
  )
);

-- =========================================================
-- pagos_venta (mismo patrón que detalle_ventas)
-- =========================================================

alter table pagos_venta enable row level security;

drop policy if exists "pagos_venta_select" on pagos_venta;
create policy "pagos_venta_select"
on pagos_venta
for select
using (
  auth_rol() = 'dueño'
  or venta_id in (select id from ventas where sucursal_id = auth_sucursal())
);

drop policy if exists "pagos_venta_insert" on pagos_venta;
create policy "pagos_venta_insert"
on pagos_venta
for insert
with check (
  venta_id in (
    select id from ventas
    where usuario_id = auth.uid()
      and (auth_rol() = 'dueño' or sucursal_id = auth_sucursal())
  )
);
