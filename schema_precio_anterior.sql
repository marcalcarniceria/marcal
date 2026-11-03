-- =========================================================
-- Ofertas directas: precio anterior por unidad de venta.
--
-- precio_anterior es solo informativo: el precio que se muestra tachado en
-- la tienda. Se sigue cobrando precio_venta (o precio_promocional si tiene),
-- así que crear_pedido_online y registrar_venta no cambian.
--
-- Va en unidades_venta_producto y no en productos porque el precio vive ahí:
-- la oferta puede ser del Kilo y no de la Bandeja.
--
-- NULL = sin oferta. No se exige precio_anterior > precio_venta: una suba de
-- precios puede pasarlo, y en ese caso la tienda deja de mostrar la oferta
-- (ver preciosDeUnidad en precios.js). El panel lo valida al guardar.
--
-- Hay que correr esto ANTES de desplegar el frontend: el formulario de
-- Productos ya manda la columna al guardar.
-- =========================================================

begin;

alter table unidades_venta_producto
  add column if not exists precio_anterior numeric;

alter table unidades_venta_producto
  drop constraint if exists unidades_venta_precio_anterior_check;

alter table unidades_venta_producto
  add constraint unidades_venta_precio_anterior_check
  check (precio_anterior is null or precio_anterior > 0);

-- La tienda lee de esta vista (schema_catalogo_unidades_publico.sql), no de la
-- tabla: sin esto el precio anterior nunca llega al catálogo. Conserva los
-- permisos que ya tiene.
create or replace view catalogo_unidades as
select
  id,
  producto_id,
  nombre_unidad,
  precio_venta,
  precio_promocional,
  precio_anterior
from unidades_venta_producto;

commit;

-- PostgREST cachea el schema: sin esto la columna nueva puede tardar en
-- aparecer en la API.
notify pgrst, 'reload schema';
