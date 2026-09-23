-- =========================================================
-- Tercera categoría de producto para la vidriera de la tienda:
-- "Más Productos" (leña, carbón, aceites, etc. — se cargan después
-- desde el panel, este cambio es solo la estructura).
--
-- El check constraint de categoria (schema_categoria_productos.sql) solo
-- permitía 'carniceria'/'verduleria' -- Postgres no deja modificar un
-- check en el lugar, hay que dropearlo y recrearlo con el valor nuevo
-- sumado. Se busca el constraint por su definición real en vez de
-- asumir un nombre (`productos_categoria_check`) -- si el que generó
-- Postgres al crearlo originalmente fue otro, un DROP CONSTRAINT con el
-- nombre equivocado no tira error pero tampoco lo saca, y quedarían DOS
-- checks contradictorios (el viejo seguiría rechazando 'mas_productos').
-- =========================================================

do $$
declare
  v_conname text;
begin
  select c.conname into v_conname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'productos'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%categoria%';

  if v_conname is not null then
    execute format('alter table productos drop constraint %I', v_conname);
  end if;
end $$;

alter table productos
  add constraint productos_categoria_check
  check (categoria in ('carniceria', 'verduleria', 'mas_productos'));

-- "Pan" pasa de sin categoría (aparecía suelto abajo, fuera de cualquier
-- bloque) a este bloque nuevo.
update productos set categoria = 'mas_productos'
  where lower(nombre) = 'pan';
