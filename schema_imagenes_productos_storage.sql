-- =========================================================
-- Parte 1: imágenes de producto -- bucket de Storage + RLS + columna.
--
-- Bucket "productos": público para lectura (las fotos tienen que verse
-- en la tienda sin sesión), solo el dueño puede subir/reemplazar/
-- borrar. Mismo criterio de auth_rol() que ya usan el resto de las
-- policies de escritura exclusivas del dueño en este proyecto.
--
-- Se califica como public.auth_rol() (no solo auth_rol()) porque estas
-- policies corren sobre storage.objects, una tabla de otro schema --
-- más seguro no depender de que el search_path por defecto incluya
-- "public" en ese contexto.
-- =========================================================

insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

drop policy if exists "productos_storage_select_publico" on storage.objects;
create policy "productos_storage_select_publico"
on storage.objects
for select
using (bucket_id = 'productos');

drop policy if exists "productos_storage_insert_dueno" on storage.objects;
create policy "productos_storage_insert_dueno"
on storage.objects
for insert
with check (bucket_id = 'productos' and public.auth_rol() = 'dueño');

drop policy if exists "productos_storage_update_dueno" on storage.objects;
create policy "productos_storage_update_dueno"
on storage.objects
for update
using (bucket_id = 'productos' and public.auth_rol() = 'dueño')
with check (bucket_id = 'productos' and public.auth_rol() = 'dueño');

drop policy if exists "productos_storage_delete_dueno" on storage.objects;
create policy "productos_storage_delete_dueno"
on storage.objects
for delete
using (bucket_id = 'productos' and public.auth_rol() = 'dueño');

-- Nullable a propósito: un producto puede no tener foto todavía y debe
-- seguir funcionando bien sin ella (placeholder en el frontend).
alter table productos add column if not exists imagen_url text;
