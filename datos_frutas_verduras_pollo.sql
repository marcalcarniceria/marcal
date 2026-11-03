-- =========================================================
-- Carga de frutas, verduras y pollo (45 productos).
--
-- Requiere schema_promocion_volumen.sql: las promos ("2 Kg x $3999") son
-- columnas de la unidad de venta, ya no packs separados.
--
-- Excepciones a la lista original, porque la promo solo admite una tanda por
-- unidad y tiene que salir menos que comprar suelto:
--   Palta: solo 2 x $1800; quedó afuera 6 x $5000.
--   Choclo: no tiene precio por unidad, así que sigue en dos packs (factor 2 y
--     6). Los packs no llevan "kilo" en el nombre porque mobile diría "/ kg".
--   Achicoria: sin promo, 2 x $1500 es lo mismo que 2 x $750.
--   Papa: no se toca, ya existe y el Kilo a $1210 hace que sus promos salgan
--     más caras que comprar suelto.
--
-- categoria: el check de productos solo admite carniceria / verduleria /
-- mas_productos, así que Frutas y Verduras van a verduleria y Pollo a
-- carniceria.
--
-- Stock, mínimo y costo arrancan en 0: no venían en la lista. Se cargan desde
-- el panel y con la primera compra a proveedor.
--
-- Se puede volver a correr: no duplica productos ni unidades que ya existan
-- (compara el nombre sin distinguir mayúsculas) y nunca modifica lo existente.
-- =========================================================

begin;

create temp table carga_productos (
  nombre text not null,
  categoria text not null,
  nombre_unidad text not null,
  factor_conversion_base numeric not null,
  precio_venta numeric not null,
  cantidad_promocion numeric,
  precio_promocion_volumen numeric
) on commit drop;

insert into carga_productos (nombre, categoria, nombre_unidad, factor_conversion_base, precio_venta, cantidad_promocion, precio_promocion_volumen) values
  -- FRUTAS
  ('Banana',            'verduleria', 'Kilo',    1, 2500,  2, 3999),
  ('Durazno',           'verduleria', 'Kilo',    1, 4500,  null, null),
  ('Durazno Promo',     'verduleria', 'Kilo',    1, 2999,  2, 4999),
  ('Arándano',          'verduleria', 'Unidad',  1, 2000,  2, 3999),
  ('Frutilla',          'verduleria', 'Kilo',    1, 7500,  2, 12999),
  ('Ciruela dulce',     'verduleria', 'Kilo',    1, 4500,  null, null),
  ('Mandarina',         'verduleria', 'Kilo',    1, 1800,  2, 2999),
  ('Naranja jugo',      'verduleria', 'Kilo',    1, 1000,  2, 1999),
  ('Naranja ombligo',   'verduleria', 'Kilo',    1, 1500,  2, 2999),
  ('Pera',              'verduleria', 'Kilo',    1, 2500,  2, 4500),
  ('Limón',             'verduleria', 'Kilo',    1, 1999,  2, 3500),
  ('Manzana verde',     'verduleria', 'Kilo',    1, 2999,  null, null),
  ('Manzana Pink Lady', 'verduleria', 'Kilo',    1, 3000,  2, 4999),
  ('Manzana deliciosa', 'verduleria', 'Kilo',    1, 4500,  null, null),
  ('Kiwi',              'verduleria', 'Kilo',    1, 7999,  null, null),
  ('Sandía',            'verduleria', 'Kilo',    1, 1200,  null, null),
  ('Mango',             'verduleria', 'Unidad',  1, 1900,  null, null),
  ('Ananá grande',      'verduleria', 'Unidad',  1, 5000,  null, null),
  ('Palta',             'verduleria', 'Unidad',  1, 1000,  2, 1800),

  -- VERDURAS
  ('Tomate grande',     'verduleria', 'Kilo',    1, 4500,  null, null),
  ('Tomate redondo',    'verduleria', 'Kilo',    1, 3999,  null, null),
  ('Tomate',            'verduleria', 'Kilo',    1, 3500,  null, null),
  ('Cherry x 100 gr',   'verduleria', 'Unidad',  1, 999,   null, null),
  ('Chaucha',           'verduleria', 'Kilo',    1, 6999,  null, null),
  ('Rúcula',            'verduleria', 'Unidad',  1, 1000,  2, 1999),
  ('Brócoli',           'verduleria', 'Unidad',  1, 1000,  2, 1999),
  ('Choclo',            'verduleria', 'Pack x2', 2, 2599,  null, null),
  ('Choclo',            'verduleria', 'Pack x6', 6, 5999,  null, null),
  ('Berenjena',         'verduleria', 'Kilo',    1, 3500,  null, null),
  ('Zapallito',         'verduleria', 'Kilo',    1, 1800,  2, 2999),
  ('Cuza',              'verduleria', 'Kilo',    1, 1800,  2, 2999),
  ('Pimiento amarillo', 'verduleria', 'Kilo',    1, 4999,  2, 8999),
  ('Pimiento rojo',     'verduleria', 'Kilo',    1, 5000,  2, 8999),
  ('Pimiento verde',    'verduleria', 'Kilo',    1, 4500,  null, null),
  ('Achicoria',         'verduleria', 'Unidad',  1, 750,   null, null),
  ('Espárrago',         'verduleria', 'Unidad',  1, 3500,  2, 6999),
  ('Rabanito',          'verduleria', 'Unidad',  1, 1300,  2, 2500),
  ('Zanahoria',         'verduleria', 'Kilo',    1, 1999,  null, null),

  -- POLLO
  ('Pechugas / Desh.',  'carniceria', 'Kilo',    1, 10500, null, null),
  ('Medallones JyQ',    'carniceria', 'Kilo',    1, 12900, null, null),
  ('Hamburguesas',      'carniceria', 'Kilo',    1, 11999, null, null),
  ('Patitas',           'carniceria', 'Kilo',    1, 12900, null, null),
  ('Milanesas',         'carniceria', 'Kilo',    1, 8999,  2, 16999),
  ('Arrollado',         'carniceria', 'Kilo',    1, 15999, null, null),
  ('Pollos Calisa',     'carniceria', 'Kilo',    1, 4999,  null, null),
  ('Pata y muslo',      'carniceria', 'Kilo',    1, 4999,  3, 13999);

insert into productos (nombre, sucursal_id, stock_actual_unidad_base, stock_minimo, categoria)
select distinct c.nombre, '558eecf8-6ade-4cb9-866d-3f9e25e3d263'::uuid, 0, 0, c.categoria
from carga_productos c
where not exists (
  select 1 from productos p
  where p.sucursal_id = '558eecf8-6ade-4cb9-866d-3f9e25e3d263'::uuid
    and lower(p.nombre) = lower(c.nombre)
);

insert into unidades_venta_producto
  (producto_id, nombre_unidad, factor_conversion_base, costo_vigente, precio_venta, cantidad_promocion, precio_promocion_volumen)
select p.id, c.nombre_unidad, c.factor_conversion_base, 0, c.precio_venta, c.cantidad_promocion, c.precio_promocion_volumen
from carga_productos c
join productos p
  on p.sucursal_id = '558eecf8-6ade-4cb9-866d-3f9e25e3d263'::uuid
 and lower(p.nombre) = lower(c.nombre)
where not exists (
  select 1 from unidades_venta_producto u
  where u.producto_id = p.id
    and lower(u.nombre_unidad) = lower(c.nombre_unidad)
);

commit;

-- Para revisar el resultado: una fila por producto de esta carga.
select p.categoria, p.nombre,
       string_agg(
         u.nombre_unidad || ' $' || u.precio_venta
           || coalesce(' (promo ' || u.cantidad_promocion || ' x $' || u.precio_promocion_volumen || ')', ''),
         ' | ' order by u.factor_conversion_base
       ) as precios
from productos p
join unidades_venta_producto u on u.producto_id = p.id
where p.sucursal_id = '558eecf8-6ade-4cb9-866d-3f9e25e3d263'::uuid
  and lower(p.nombre) in (
    'banana', 'durazno', 'durazno promo', 'arándano', 'frutilla', 'ciruela dulce', 'mandarina',
    'naranja jugo', 'naranja ombligo', 'pera', 'limón', 'manzana verde', 'manzana pink lady',
    'manzana deliciosa', 'kiwi', 'sandía', 'mango', 'ananá grande', 'palta',
    'tomate grande', 'tomate redondo', 'tomate', 'cherry x 100 gr', 'chaucha', 'rúcula', 'brócoli',
    'choclo', 'berenjena', 'zapallito', 'cuza', 'pimiento amarillo', 'pimiento rojo',
    'pimiento verde', 'achicoria', 'espárrago', 'rabanito', 'zanahoria',
    'pechugas / desh.', 'medallones jyq', 'hamburguesas', 'patitas', 'milanesas', 'arrollado',
    'pollos calisa', 'pata y muslo'
  )
group by p.categoria, p.nombre
order by p.categoria, p.nombre;
