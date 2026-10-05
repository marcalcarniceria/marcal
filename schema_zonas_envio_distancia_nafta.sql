-- =========================================================
-- Tramo 1 de envíos: distancia por zona + costo de nafta ESTIMADO
-- (informativo, para que el dueño decida cuánto cobrar por zona -- NO
-- se usa en el cálculo del checkout, que sigue usando costo_envio tal
-- cual está definido hoy).
-- =========================================================

alter table zonas_envio add column if not exists distancia_km numeric;

-- Una sola fila -- litros_cada_100km/precio_nafta_litro se editan desde
-- la pantalla de administración en vez de hardcodearse en el código,
-- porque el precio de la nafta cambia seguido.
create table if not exists config_envios (
  id uuid primary key default gen_random_uuid(),
  litros_cada_100km numeric not null default 10,
  precio_nafta_litro numeric not null
);

alter table config_envios enable row level security;

drop policy if exists "config_envios_select" on config_envios;
create policy "config_envios_select"
on config_envios
for select
to authenticated
using (true);

drop policy if exists "config_envios_write_dueno" on config_envios;
create policy "config_envios_write_dueno"
on config_envios
for all
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

-- Semilla: la tabla nunca debe quedar vacía (la pantalla de admin edita
-- esta fila, no crea una nueva) -- precio_nafta_litro arranca en 0 como
-- placeholder hasta que el dueño lo cargue con el valor real.
insert into config_envios (litros_cada_100km, precio_nafta_litro)
select 10, 0
where not exists (select 1 from config_envios);
