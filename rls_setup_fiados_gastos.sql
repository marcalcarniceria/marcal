-- =========================================================
-- clientes_fiados
-- =========================================================

alter table clientes_fiados enable row level security;

drop policy if exists "clientes_fiados_select" on clientes_fiados;
create policy "clientes_fiados_select"
on clientes_fiados
for select
using (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
);

drop policy if exists "clientes_fiados_insert" on clientes_fiados;
create policy "clientes_fiados_insert"
on clientes_fiados
for insert
with check (
  auth_rol() in ('dueño', 'cajero')
  and (auth_rol() = 'dueño' or sucursal_id = auth_sucursal())
);

drop policy if exists "clientes_fiados_update_dueno" on clientes_fiados;
create policy "clientes_fiados_update_dueno"
on clientes_fiados
for update
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

drop policy if exists "clientes_fiados_delete_dueno" on clientes_fiados;
create policy "clientes_fiados_delete_dueno"
on clientes_fiados
for delete
using (auth_rol() = 'dueño');

-- =========================================================
-- gastos
-- =========================================================

alter table gastos enable row level security;

drop policy if exists "gastos_select" on gastos;
create policy "gastos_select"
on gastos
for select
using (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
);

drop policy if exists "gastos_insert" on gastos;
create policy "gastos_insert"
on gastos
for insert
with check (
  usuario_id = auth.uid()
  and auth_rol() in ('dueño', 'cajero')
  and (auth_rol() = 'dueño' or sucursal_id = auth_sucursal())
);

-- Sin UPDATE/DELETE: una vez cargado el gasto, solo el dueño podría
-- necesitar corregirlo manualmente por SQL si hace falta (no vía app).

-- =========================================================
-- pagos_fiados
-- =========================================================

alter table pagos_fiados enable row level security;

drop policy if exists "pagos_fiados_select" on pagos_fiados;
create policy "pagos_fiados_select"
on pagos_fiados
for select
using (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
);

drop policy if exists "pagos_fiados_insert" on pagos_fiados;
create policy "pagos_fiados_insert"
on pagos_fiados
for insert
with check (
  auth_rol() in ('dueño', 'cajero')
  and (auth_rol() = 'dueño' or sucursal_id = auth_sucursal())
);
