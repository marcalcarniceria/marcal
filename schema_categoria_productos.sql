-- =========================================================
-- Categoría de producto para la vidriera de la tienda
-- ("Carnicería" / "Verdulería").
--
-- Hasta ahora `productos` no tenía ningún campo de categoría, así que
-- la tienda no tenía de dónde sacar qué producto va en cada bloque.
-- Nullable a propósito: un producto sin categoría simplemente no
-- aparece en los bloques de la vidriera (sigue apareciendo en el
-- catálogo completo de más abajo).
--
-- La policy pública de SELECT de productos ya cubre la columna nueva
-- (las policies son por fila, no por columna): no hace falta tocar RLS.
-- =========================================================

alter table productos
  add column if not exists categoria text
  check (categoria in ('carniceria', 'verduleria'));

-- Asignación inicial de los productos que hoy existen. "pan" queda sin
-- categoría a propósito (no es ni carnicería ni verdulería): decidí vos
-- dónde va. Un producto sin categoría no aparece en los bloques de la
-- vidriera, solo en el catálogo completo.
update productos set categoria = 'carniceria'
  where lower(nombre) in ('pollo entero', 'carne picada');

update productos set categoria = 'verduleria'
  where lower(nombre) in ('papa', 'huevo');

-- Para asignar/cambiar la categoría de cualquier otro producto:
--   update productos set categoria = 'carniceria' where nombre = '...';
--   update productos set categoria = 'verduleria' where nombre = '...';
--   update productos set categoria = null         where nombre = '...';
