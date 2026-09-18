-- =========================================================
-- Fix: en schema_ecommerce.sql, "productos_select_publico" da SELECT
-- solo `to anon`. Un cliente logueado en la tienda consulta como rol
-- `authenticated` (no `anon`), así que esa policy no lo cubre.
--
-- Efecto real del bug: en "Mis pedidos", el embed
-- detalle_pedidos(productos(nombre)) devolvía productos = null para
-- clientes logueados (RLS bloqueaba la fila de productos), y por eso
-- el nombre del producto aparecía como "undefined" en el frontend.
--
-- Fix: agregar `authenticated` a la misma policy pública de catálogo
-- (los productos ya son públicos para cualquier visitante anónimo, así
-- que no hay ningún dato nuevo que se esté exponiendo).
-- =========================================================

drop policy if exists "productos_select_publico" on productos;
create policy "productos_select_publico"
on productos
for select
to anon, authenticated
using (true);
