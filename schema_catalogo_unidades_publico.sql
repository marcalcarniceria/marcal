-- =========================================================
-- Catálogo público de unidades de venta sin datos internos (A1 de la
-- auditoría de seguridad).
--
-- Problema: "unidades_venta_select_publico" (schema_ecommerce.sql) daba
-- SELECT de TODA la fila a anon -- costo_vigente incluido, o sea los
-- márgenes de cada producto para cualquiera con la anon key. No se
-- puede resolver revocando la columna: el staff también consulta como
-- `authenticated` y necesita el costo.
--
-- Además la policy era solo `to anon`: un cliente LOGUEADO en la tienda
-- (rol authenticated) no veía ninguna unidad -- catálogo sin precios y
-- "Mis pedidos" con la unidad vacía. Mismo bug que ya se corrigió para
-- productos en schema_fix_productos_rls_cliente.sql.
--
-- Fix: la tienda lee de esta vista, que solo tiene las columnas que el
-- catálogo necesita, y anon deja de poder leer la tabla.
--
-- La vista es a propósito SIN security_invoker (corre con los permisos
-- de su dueño y no aplica la RLS de la tabla): es la única forma de que
-- anon lea estas columnas sin tener acceso a la tabla. El Security
-- Advisor de Supabase la va a marcar como "Security Definer View" --
-- es esperado acá, porque la vista solo expone datos públicos.
-- (Diferente de movimientos_dinero y las otras vistas internas, que
-- SÍ tienen que ser security_invoker.)
--
-- Después de correr esto hay que desplegar el frontend que lee de
-- catalogo_unidades (useTiendaCatalogo.js y useMisPedidos.js).
-- =========================================================

begin;

create or replace view catalogo_unidades as
select
  id,
  producto_id,     -- lo necesita PostgREST para embeber productos -> catalogo_unidades
  nombre_unidad,
  precio_venta,
  precio_promocional
from unidades_venta_producto;

revoke all on catalogo_unidades from public;
grant select on catalogo_unidades to anon, authenticated;

-- anon ya no lee la tabla: ni por policy ni por grant.
drop policy if exists "unidades_venta_select_publico" on unidades_venta_producto;
revoke all on unidades_venta_producto from anon;

commit;

-- PostgREST cachea el schema: sin esto la vista nueva puede tardar en
-- aparecer en la API (y los embeds devuelven error de relación).
notify pgrst, 'reload schema';
