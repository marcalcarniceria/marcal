-- =========================================================
-- Módulo "Movimientos de Stock": tabla de ajustes manuales,
-- vista de auditoría unificada y RPC para registrar mermas /
-- ingresos no comerciales.
--
-- Auditoría previa del schema (para no duplicar/romper lógica
-- existente -- ver detalle completo en la respuesta del chat):
--   - ventas(id, sucursal_id, usuario_id, fecha_hora, estado, ...)
--   - detalle_ventas(id, venta_id, producto_id, cantidad, subtotal, ...)
--   - compras_proveedor(id, sucursal_id, proveedor_id, fecha, estado,
--     monto_total) -- SIN usuario_id. estado in ('pedido','confirmada').
--   - detalle_compras(id, compra_id, producto_id, cantidad,
--     costo_unitario, subtotal)
--   - pedidos_online(id, sucursal_id, estado, fecha_creacion, ...) --
--     SIN usuario_id (son pedidos de clientes anónimos vía checkout
--     web). estado incluye 'en_preparacion' en adelante.
--   - detalle_pedidos(id, pedido_id, producto_id, cantidad, subtotal)
--   - productos(id, sucursal_id, nombre, stock_actual_unidad_base, ...)
--   - auth_rol() / auth_sucursal() ya existen (rls_setup_cajero.sql)
--
-- NOTA IMPORTANTE (decidida con el usuario): la tabla
-- `transformaciones_stock` que pide el punto 2 de la vista NO existe
-- en el schema actual -- se auditó todo el repo y no hay rastro. El
-- despiece hoy (registrar_compra_por_plantilla, en
-- schema_plantillas_despiece.sql) se modela como una COMPRA repartida
-- entre productos destino, no como una transformación que descuenta
-- una pieza origen. Se decidió NO tocar esa lógica ya probada en
-- producción y OMITIR esa rama de la vista por ahora. Cuando se
-- rediseñe el despiece como transformación real de stock, agregar acá
-- la rama correspondiente con UNION ALL.
--
-- NOTA (caveat, no se toca en este script): `confirmar_pedido_compra`
-- (schema_pedidos_compra.sql) tiene un TODO histórico sin resolver --
-- al confirmar un pedido de compra NO actualiza stock todavía. Eso es
-- un gap preexistente ajeno a este módulo. La vista de abajo filtra
-- detalle_compras por compras_proveedor.estado = 'confirmada' porque
-- es la señal de "esto ya pasó" que usa el resto del sistema, pero si
-- ese TODO se resuelve distinto en el futuro puede haber que ajustar
-- este filtro.
-- =========================================================


-- =========================================================
-- 1) Tabla ajustes_stock
-- =========================================================

create table if not exists ajustes_stock (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references sucursales(id),
  producto_id uuid not null references productos(id),
  usuario_id uuid not null references usuarios(id),
  tipo_movimiento text not null check (tipo_movimiento in ('entrada', 'salida')),
  cantidad numeric not null check (cantidad > 0),
  motivo text,
  fecha timestamptz not null default now()
);

alter table ajustes_stock enable row level security;

-- Se puede leer explícitamente además de via la vista (por si algún
-- día se necesita una pantalla que liste solo ajustes).
grant select on ajustes_stock to authenticated;

drop policy if exists "ajustes_stock_select" on ajustes_stock;
create policy "ajustes_stock_select"
on ajustes_stock
for select
using (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
);

-- Sin policy de INSERT/UPDATE/DELETE directa: todo pasa por
-- rpc_registrar_ajuste_stock (SECURITY DEFINER, ver más abajo), que
-- hace sus propias validaciones de rol/sucursal/usuario antes de
-- insertar. Mismo patrón que ventas (rls_setup_cajero.sql) y gastos
-- (rls_setup_fiados_gastos.sql): nada se edita/borra desde el
-- cliente, es un registro de auditoría inmutable.


-- =========================================================
-- 2) Vista vw_historial_movimientos_stock
--
-- security_invoker = true es necesario: si esta vista se crea desde
-- el SQL Editor de Supabase queda con owner "postgres" (rol con
-- BYPASSRLS), y sin este flag Postgres resolvería las tablas de abajo
-- con los privilegios del owner en vez de los del usuario que
-- consulta la vista, saltándose las RLS de ventas/compras/pedidos/
-- ajustes_stock por completo. Con security_invoker = true, la vista
-- respeta las RLS de cada usuario real (vía auth_rol()/auth_sucursal(),
-- que a su vez leen auth.uid() de la sesión -- esto funciona igual
-- con o sin el flag, lo que cambia es que SIN el flag ni siquiera se
-- llega a evaluar esa RLS).
-- =========================================================

create or replace view vw_historial_movimientos_stock
with (security_invoker = true)
as
select
  dv.id as id_movimiento,
  'detalle_ventas'::text as origen_tabla,
  v.fecha_hora as fecha,
  dv.producto_id,
  p.nombre as nombre_producto,
  'salida'::text as tipo,
  dv.cantidad,
  ('Venta #' || v.id::text) as motivo_o_referencia,
  v.usuario_id
from detalle_ventas dv
join ventas v on v.id = dv.venta_id
join productos p on p.id = dv.producto_id

union all

select
  dp.id as id_movimiento,
  'detalle_pedidos'::text as origen_tabla,
  po.fecha_creacion as fecha,
  dp.producto_id,
  p.nombre as nombre_producto,
  'salida'::text as tipo,
  dp.cantidad,
  ('Pedido online #' || po.id::text) as motivo_o_referencia,
  null::uuid as usuario_id
from detalle_pedidos dp
join pedidos_online po on po.id = dp.pedido_id
join productos p on p.id = dp.producto_id
where po.estado in ('en_preparacion', 'en_camino', 'entregado')

union all

select
  dc.id as id_movimiento,
  'detalle_compras'::text as origen_tabla,
  cp.fecha as fecha,
  dc.producto_id,
  p.nombre as nombre_producto,
  'entrada'::text as tipo,
  dc.cantidad,
  ('Compra #' || cp.id::text) as motivo_o_referencia,
  null::uuid as usuario_id
from detalle_compras dc
join compras_proveedor cp on cp.id = dc.compra_id
join productos p on p.id = dc.producto_id
where cp.estado = 'confirmada'

union all

select
  a.id as id_movimiento,
  'ajustes_stock'::text as origen_tabla,
  a.fecha as fecha,
  a.producto_id,
  p.nombre as nombre_producto,
  a.tipo_movimiento as tipo,
  a.cantidad,
  coalesce(nullif(trim(a.motivo), ''), 'Ajuste manual') as motivo_o_referencia,
  a.usuario_id
from ajustes_stock a
join productos p on p.id = a.producto_id;

grant select on vw_historial_movimientos_stock to authenticated;


-- =========================================================
-- 3) RPC rpc_registrar_ajuste_stock
--
-- SECURITY DEFINER porque ajustes_stock no tiene policy de INSERT
-- (a propósito, igual que ventas). La función hace ella misma las
-- validaciones de permiso que la RLS haría. NO valida stock
-- resultante contra cero -- el ritmo del mostrador manda, una merma
-- puede dejar el stock en negativo sin tirar error.
--
-- Se llama desde React con:
--   supabase.rpc('rpc_registrar_ajuste_stock', {
--     p_producto_id: '...',
--     p_cantidad: 2.5,
--     p_tipo_movimiento: 'salida',
--     p_motivo: 'Merma por descomposición',
--     p_usuario_id: session.user.id,
--     p_sucursal_id: SUCURSAL_ID
--   })
-- =========================================================

create or replace function rpc_registrar_ajuste_stock(
  p_producto_id uuid,
  p_cantidad numeric,
  p_tipo_movimiento text,
  p_motivo text,
  p_usuario_id uuid,
  p_sucursal_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ajuste_id uuid;
  v_producto_sucursal uuid;
begin
  if p_producto_id is null then
    raise exception 'p_producto_id es obligatorio';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if p_tipo_movimiento is null or p_tipo_movimiento not in ('entrada', 'salida') then
    raise exception 'p_tipo_movimiento debe ser ''entrada'' o ''salida''';
  end if;

  if p_sucursal_id is null then
    raise exception 'p_sucursal_id es obligatorio';
  end if;

  -- Reemplaza la validación que antes haría la policy de INSERT
  if p_usuario_id is distinct from auth.uid() then
    raise exception 'p_usuario_id no coincide con el usuario autenticado';
  end if;

  if auth_rol() not in ('dueño', 'verdulero', 'carnicero') then
    raise exception 'No tenés permiso para registrar ajustes de stock';
  end if;

  if auth_rol() <> 'dueño' and p_sucursal_id <> auth_sucursal() then
    raise exception 'No tenés permiso para ajustar stock en esa sucursal';
  end if;

  select sucursal_id into v_producto_sucursal
    from productos
    where id = p_producto_id
    for update;

  if v_producto_sucursal is null then
    raise exception 'El producto no existe';
  end if;

  if v_producto_sucursal <> p_sucursal_id then
    raise exception 'El producto no pertenece a la sucursal indicada';
  end if;

  insert into ajustes_stock (
    sucursal_id, producto_id, usuario_id, tipo_movimiento, cantidad, motivo, fecha
  ) values (
    p_sucursal_id, p_producto_id, p_usuario_id, p_tipo_movimiento, p_cantidad,
    nullif(trim(coalesce(p_motivo, '')), ''), now()
  )
  returning id into v_ajuste_id;

  -- Nunca bloquea por stock negativo: solo suma o resta.
  if p_tipo_movimiento = 'entrada' then
    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base + p_cantidad
    where id = p_producto_id;
  else
    update productos
    set stock_actual_unidad_base = stock_actual_unidad_base - p_cantidad
    where id = p_producto_id;
  end if;

  return v_ajuste_id;
end;
$$;

grant execute on function rpc_registrar_ajuste_stock(uuid, numeric, text, text, uuid, uuid) to authenticated;
