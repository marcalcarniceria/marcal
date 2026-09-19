-- =========================================================
-- Notificación flotante de pedidos online nuevos (panel de staff).
-- =========================================================

-- 1) Supabase Realtime (postgres_changes) solo entrega eventos de
--    tablas agregadas a la publicación `supabase_realtime`. Esta tabla
--    nunca se agregó.
alter publication supabase_realtime add table pedidos_online;

-- 2) BUG que hubiera dejado la notificación sin funcionar para el
--    cajero: "pedidos_online_select_staff" (schema_ecommerce.sql) solo
--    daba SELECT a auth_rol() = 'dueño' o al repartidor asignado. Como
--    Realtime respeta RLS, el cajero nunca habría recibido el evento
--    INSERT aunque el código del front estuviera bien. Se amplía al
--    mismo patrón "personal de esta sucursal" que usan el resto de las
--    tablas (auth_sucursal()), sin sacarle nada a dueño/repartidor.
drop policy if exists "pedidos_online_select_staff" on pedidos_online;
create policy "pedidos_online_select_staff"
on pedidos_online
for select
using (
  auth_rol() = 'dueño'
  or (auth_rol() = 'repartidor' and repartidor_id = auth.uid())
  or sucursal_id = auth_sucursal()
);
