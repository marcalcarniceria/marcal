-- =========================================================
-- Precio promocional fijo por unidad de venta (Fase 1: estructura).
--
-- El dueño carga un precio cerrado (ej. $4500) en vez de un porcentaje,
-- para no terminar con decimales ni cambio difícil en el local.
--
-- Va en unidades_venta_producto y no en productos porque el precio vive
-- ahí: un mismo producto puede venderse por Kilo y por Bandeja con
-- precios distintos, y cada uno puede tener (o no) su promo.
--
-- NULL = sin promo, se vende a precio_venta. El check impide guardar 0 o
-- negativos (el panel ya manda NULL en esos casos, esto es la red de
-- seguridad del lado de la base).
--
-- No hay RPCs de alta/edición de productos que actualizar: el panel
-- (Productos.jsx) escribe directo en la tabla, y las policies de RLS
-- existentes (rls_setup_cajero.sql / schema_ecommerce.sql) son por fila,
-- así que ya cubren la columna nueva.
--
-- OJO (Fase 2): crear_pedido_online sigue cobrando uvp.precio_venta. Hasta
-- que se actualice, cargar una promo acá no cambia lo que se cobra.
-- =========================================================

alter table unidades_venta_producto
  add column if not exists precio_promocional numeric;

alter table unidades_venta_producto
  drop constraint if exists unidades_venta_precio_promocional_check;

alter table unidades_venta_producto
  add constraint unidades_venta_precio_promocional_check
  check (precio_promocional is null or precio_promocional > 0);
