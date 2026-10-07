-- =========================================================
-- "Mis pedidos" del cliente necesita mostrar más datos (método de
-- entrega/pago, dirección, nombre del repartidor asignado) y paginar el
-- historial igual que el resto del panel.
--
-- El nombre del repartidor es el único dato que la policy
-- "usuarios_select_propio" / "usuarios_select_dueno" NO deja ver a un
-- cliente_web (no es su fila ni es dueño) -- en vez de ampliar la RLS de
-- usuarios (que expondría teléfono/rol/etc. de cualquier repartidor), se
-- resuelve con una función security definer que solo devuelve lo que
-- hace falta y SOLO para pedidos del propio cliente autenticado.
-- =========================================================

create or replace function obtener_mis_pedidos(p_limit int default 5, p_offset int default 0)
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
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id, p.fecha_creacion, p.total, p.subtotal_productos, p.costo_envio, p.estado,
    p.metodo_entrega, p.metodo_pago, p.direccion_envio, u.nombre as repartidor_nombre,
    count(*) over() as total_pedidos
  from pedidos_online p
  left join usuarios u on u.id = p.repartidor_id
  where p.cliente_web_id = auth.uid()
  order by p.fecha_creacion desc
  limit p_limit offset p_offset
$$;

grant execute on function obtener_mis_pedidos(int, int) to authenticated;
