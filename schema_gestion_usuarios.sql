-- =========================================================
-- "Gestión de usuarios" (dueño-only): listar empleados y clientes de la
-- tienda, ver detalle de un cliente, y (vía Edge Function, ver
-- supabase/functions/admin-gestionar-usuarios) crear empleados nuevos y
-- activar/desactivar su acceso.
--
-- IMPORTANTE: ni `usuarios` ni `clientes_web` tienen su CREATE TABLE
-- versionado en este repo (se crearon a mano en algún momento) -- esta
-- migración asume las columnas que ya confirmamos por código/policies
-- (usuarios: id, nombre, rol, sucursal_id; clientes_web: id, nombre,
-- telefono, direccion, email). Si tu tabla real tiene columnas de más,
-- no pasa nada, esto no las toca.
-- =========================================================

-- 1) Columna nueva: estado activo/inactivo del empleado. Arranca en
--    true para todos los existentes (nadie queda bloqueado por esta
--    migración).
alter table usuarios add column if not exists activo boolean not null default true;

-- 2) UPDATE de usuarios: hoy no existía NINGUNA policy de insert/update/
--    delete (el alta era 100% manual por Dashboard). Esto habilita que
--    el dueño pueda editar nombre/rol/activo de un empleado directo
--    desde el frontend, sin pasar por la Edge Function (esa queda
--    reservada para lo que SÍ necesita la service role key: crear la
--    cuenta de Auth, y banear/desbanear al desactivar).
drop policy if exists "usuarios_update_dueno" on usuarios;
create policy "usuarios_update_dueno"
on usuarios
for update
using (auth_rol() = 'dueño')
with check (auth_rol() = 'dueño');

-- 3) Índice para que "cantidad de pedidos por cliente" (abajo) no sea
--    un seq scan a medida que crece pedidos_online.
create index if not exists idx_pedidos_online_cliente_web_id on pedidos_online(cliente_web_id);

-- =========================================================
-- 4) admin_listar_usuarios: empleados + su email (vive en auth.users,
--    no en `usuarios` -- auth.users no es accesible por PostgREST, pero
--    esta función SECURITY DEFINER sí puede leerlo directo).
-- =========================================================
create or replace function admin_listar_usuarios()
returns table (
  id uuid,
  nombre text,
  rol text,
  activo boolean,
  email text,
  fecha_alta timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth_rol() <> 'dueño' then
    raise exception 'No autorizado.';
  end if;

  return query
    select u.id, u.nombre, u.rol, u.activo, au.email, au.created_at
    from usuarios u
    join auth.users au on au.id = u.id
    order by u.nombre;
end;
$$;

grant execute on function admin_listar_usuarios() to authenticated;

-- =========================================================
-- 5) admin_listar_clientes_web: clientes de la tienda + fecha de
--    registro real (auth.users.created_at, no una columna propia que
--    no existe) + cantidad de pedidos.
-- =========================================================
create or replace function admin_listar_clientes_web()
returns table (
  id uuid,
  nombre text,
  email text,
  telefono text,
  direccion text,
  fecha_registro timestamptz,
  cantidad_pedidos bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth_rol() <> 'dueño' then
    raise exception 'No autorizado.';
  end if;

  return query
    select
      c.id, c.nombre, c.email, c.telefono, c.direccion, au.created_at,
      count(p.id) as cantidad_pedidos
    from clientes_web c
    join auth.users au on au.id = c.id
    left join pedidos_online p on p.cliente_web_id = c.id
    group by c.id, c.nombre, c.email, c.telefono, c.direccion, au.created_at
    order by c.nombre;
end;
$$;

grant execute on function admin_listar_clientes_web() to authenticated;

-- =========================================================
-- 6) admin_pedidos_cliente: mismo shape que obtener_mis_pedidos (ver
--    schema_mis_pedidos_detalle_cliente.sql) pero para que el DUEÑO vea
--    el historial de CUALQUIER cliente, no solo el propio. Las líneas
--    de cada pedido (detalle_pedidos) NO necesitan una función nueva --
--    la policy "detalle_pedidos_select_staff" ya deja ver cualquier
--    pedido a auth_rol() = 'dueño' (confirmado en
--    schema_pedidos_stock_insuficiente.sql), así que el frontend puede
--    consultarla directo con un .from(), igual que PedidosOnline.jsx.
-- =========================================================
create or replace function admin_pedidos_cliente(p_cliente_id uuid, p_limit int default 5, p_offset int default 0)
returns table (
  id uuid,
  fecha_creacion timestamptz,
  total numeric,
  subtotal_productos numeric,
  costo_envio numeric,
  estado text,
  metodo_entrega text,
  metodo_pago text,
  direccion_envio text,
  repartidor_nombre text,
  total_pedidos bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth_rol() <> 'dueño' then
    raise exception 'No autorizado.';
  end if;

  return query
    select
      p.id, p.fecha_creacion, p.total, p.subtotal_productos, p.costo_envio, p.estado,
      p.metodo_entrega, p.metodo_pago, p.direccion_envio, u.nombre as repartidor_nombre,
      count(*) over() as total_pedidos
    from pedidos_online p
    left join usuarios u on u.id = p.repartidor_id
    where p.cliente_web_id = p_cliente_id
    order by p.fecha_creacion desc
    limit p_limit offset p_offset;
end;
$$;

grant execute on function admin_pedidos_cliente(uuid, int, int) to authenticated;
