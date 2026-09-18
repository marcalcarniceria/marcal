-- =========================================================
-- clientes_web: cuentas de clientes de la tienda online (NO es lo
-- mismo que `usuarios`, que son cuentas de personal creadas a mano
-- desde Supabase Auth -- dueño/cajero/verdulero/carnicero). El
-- checkout sigue funcionando sin cuenta (invitado); esta tabla es
-- para quien elige crearse una.
--
-- Campos = exactamente los que ya pide el formulario de checkout
-- real (Checkout.jsx): nombre, telefono, direccion. El checkout NO
-- tiene localidad/código postal por separado -- la zona de envío
-- (zonas_envio) ya cumple ese rol y es una elección por pedido, no
-- un dato fijo del cliente, así que no se agrega acá. `notas`
-- tampoco: es una aclaración de un pedido puntual, no un dato de
-- perfil. `email` se guarda también acá (duplicado de
-- auth.users.email) para no tener que leer auth.users desde el
-- cliente, que requiere privilegios que el usuario no tiene.
-- =========================================================

create table if not exists clientes_web (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  telefono text,
  direccion text,
  email text not null
);

alter table clientes_web enable row level security;

drop policy if exists "clientes_web_propio" on clientes_web;
create policy "clientes_web_propio"
on clientes_web
for all
using (id = auth.uid())
with check (id = auth.uid());
