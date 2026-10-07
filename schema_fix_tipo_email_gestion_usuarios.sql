-- Fix: auth.users.email es varchar(255), no text -- returns table exige
-- coincidencia exacta de tipo (no solo asignable), por eso el 42804.
-- Se castea explícito a text en las dos funciones que lo devuelven.

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
    select u.id, u.nombre, u.rol, u.activo, au.email::text, au.created_at
    from usuarios u
    join auth.users au on au.id = u.id
    order by u.nombre;
end;
$$;

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
      c.id, c.nombre, c.email::text, c.telefono, c.direccion, au.created_at,
      count(p.id) as cantidad_pedidos
    from clientes_web c
    join auth.users au on au.id = c.id
    left join pedidos_online p on p.cliente_web_id = c.id
    group by c.id, c.nombre, c.email, c.telefono, c.direccion, au.created_at
    order by c.nombre;
end;
$$;
