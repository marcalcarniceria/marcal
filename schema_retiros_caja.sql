-- =========================================================
-- Retiros de efectivo / sangrías.
--
-- Sacar plata de la gaveta y pasarla a la caja fuerte NO es un gasto:
-- la plata sigue siendo del negocio. Por eso va en una tabla propia
-- (retiros_caja) y no en `gastos`:
--   - Ganancias / reportes: ningún reporte de ganancias usa `gastos` ni
--     esta tabla -> los retiros no afectan ganancias, sin tocar nada.
--   - movimientos_dinero: los retiros aparecen con tipo 'retiro' (ni
--     'ingreso' ni 'egreso'); movimientos_dinero_totales solo suma
--     'ingreso'/'egreso', así que el saldo neto no cambia.
--   - Arqueo: esperado en caja = apertura + ventas efectivo + cobros de
--     fiados efectivo - gastos efectivo - pagos a proveedores efectivo
--     - RETIROS. Se aplica en CierreCaja.jsx (pantalla) y en la vista
--     historial_cierres_caja (historial + reporte de arqueos).
--
-- Además, historial_cierres_caja definía el "día" de cada cierre con
-- cc.fecha::timestamptz = medianoche UTC: las ventas en efectivo de
-- 21:00 a 24:00 (hora argentina) caían en el día SIGUIENTE del
-- historial, mientras CierreCaja.jsx (hora local) las contaba en el día
-- correcto. Ahora el día se calcula en hora de Córdoba en las dos.
--
-- Se registra solo por RPC (registrar_retiro_caja): sin policies de
-- INSERT/UPDATE/DELETE, un retiro no se puede editar ni borrar desde la
-- API (queda auditado quién, cuándo y cuánto).
--
-- Correr completo en el SQL Editor de Supabase. Idempotente.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Tabla
-- ---------------------------------------------------------

create table if not exists retiros_caja (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references sucursales(id),
  usuario_id uuid not null references usuarios(id),
  monto numeric(12,2) not null check (monto > 0),
  motivo text,
  fecha timestamptz not null default now()
);

create index if not exists retiros_caja_sucursal_fecha_idx on retiros_caja (sucursal_id, fecha);

alter table retiros_caja enable row level security;

drop policy if exists "retiros_caja_select" on retiros_caja;
create policy "retiros_caja_select"
on retiros_caja
for select
using (
  auth_rol() = 'dueño'
  or sucursal_id = auth_sucursal()
);

grant select on retiros_caja to authenticated;

-- ---------------------------------------------------------
-- 2) RPC registrar_retiro_caja
-- ---------------------------------------------------------

create or replace function registrar_retiro_caja(p_monto numeric, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sucursal uuid;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_id uuid;
begin
  -- Quien maneja la caja: dueño y cajero (mismos roles que pueden
  -- cargar clientes fiados / vender).
  if coalesce(auth_rol(), '') not in ('dueño', 'cajero') then
    raise exception 'No tenés permiso para registrar retiros de caja';
  end if;

  if p_monto is null or p_monto = 'NaN'::numeric or p_monto <= 0 or p_monto > 100000000 then
    raise exception 'El monto del retiro tiene que ser mayor a cero';
  end if;

  if v_motivo is not null and length(v_motivo) > 200 then
    raise exception 'La nota es demasiado larga (máximo 200 caracteres)';
  end if;

  v_sucursal := auth_sucursal();

  -- Un retiro después del cierre cambiaría un arqueo ya registrado.
  if exists (
    select 1 from cierres_caja
    where sucursal_id = v_sucursal
      and fecha = (now() at time zone 'America/Argentina/Cordoba')::date
  ) then
    raise exception 'La caja de hoy ya está cerrada: no se pueden registrar más retiros';
  end if;

  insert into retiros_caja (sucursal_id, usuario_id, monto, motivo)
  values (v_sucursal, auth.uid(), round(p_monto, 2), v_motivo)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function registrar_retiro_caja(numeric, text) from public, anon;
grant execute on function registrar_retiro_caja(numeric, text) to authenticated;

-- ---------------------------------------------------------
-- 3) movimientos_dinero -- versión vigente
--    (schema_metodo_pago_entrega_cobro.sql) + retiros con tipo 'retiro'.
-- ---------------------------------------------------------

create or replace view movimientos_dinero
with (security_invoker = true)
as
select
  pv.id as id,
  'ingreso' as tipo,
  v.fecha_hora as fecha,
  pv.monto as monto,
  'Venta - ' || coalesce(u.nombre, 'Cajero') as motivo,
  v.sucursal_id as sucursal_id
from pagos_venta pv
join ventas v on v.id = pv.venta_id
left join usuarios u on u.id = v.usuario_id
where v.estado = 'activa'

union all

select
  pf.id,
  'ingreso',
  pf.fecha,
  pf.monto,
  'Cobro de fiado - ' || cf.nombre,
  pf.sucursal_id
from pagos_fiados pf
join clientes_fiados cf on cf.id = pf.cliente_fiado_id

union all

select
  g.id,
  'egreso',
  g.fecha,
  g.monto,
  'Gasto - ' || g.concepto,
  g.sucursal_id
from gastos g

union all

select
  pp.id,
  'egreso',
  pp.fecha,
  pp.monto,
  'Pago a proveedor - ' || p.nombre,
  pp.sucursal_id
from pagos_proveedor pp
join proveedores p on p.id = pp.proveedor_id

union all

select
  po.id,
  'ingreso',
  po.fecha_pago,
  po.total::numeric(12,2),
  'Pedido online - ' || po.cliente_nombre,
  po.sucursal_id
from pedidos_online po
where po.fecha_pago is not null and po.estado <> 'cancelado'

union all

-- Retiros a caja fuerte: tipo propio, NO egreso (no es plata que se va
-- del negocio). movimientos_dinero_totales no los suma.
select
  r.id,
  'retiro',
  r.fecha,
  r.monto,
  'Retiro a caja fuerte' || coalesce(' - ' || r.motivo, ''),
  r.sucursal_id
from retiros_caja r;


grant select on movimientos_dinero to authenticated;

-- ---------------------------------------------------------
-- 4) historial_cierres_caja: resta los retiros y calcula el día en hora
--    argentina. retiros_efectivo va AL FINAL de las columnas: un
--    CREATE OR REPLACE VIEW solo puede agregar columnas al final.
-- ---------------------------------------------------------

create or replace view historial_cierres_caja
with (security_invoker = true)
as
select
  cc.id,
  cc.sucursal_id,
  cc.fecha,
  cc.monto_apertura,
  cc.monto_cierre_declarado,
  cc.fecha_cierre,
  coalesce(ve.total, 0) as ventas_efectivo,
  coalesce(fi.total, 0) as fiados_efectivo,
  coalesce(ga.total, 0) as gastos_efectivo,
  coalesce(pp.total, 0) as pagos_proveedor_efectivo,
  cc.monto_cierre_declarado - (
    cc.monto_apertura
    + coalesce(ve.total, 0)
    + coalesce(fi.total, 0)
    - coalesce(ga.total, 0)
    - coalesce(pp.total, 0)
    - coalesce(re.total, 0)
  ) as diferencia,
  coalesce(re.total, 0) as retiros_efectivo
from cierres_caja cc
cross join lateral (
  select
    (cc.fecha::timestamp at time zone 'America/Argentina/Cordoba') as desde,
    ((cc.fecha + 1)::timestamp at time zone 'America/Argentina/Cordoba') as hasta
) dia
left join lateral (
  select sum(pv.monto) as total
  from ventas v
  join pagos_venta pv on pv.venta_id = v.id
  join metodos_pago mp on mp.id = pv.metodo_pago_id
  where v.sucursal_id = cc.sucursal_id
    and v.estado = 'activa'
    and mp.nombre = 'Efectivo'
    and v.fecha_hora >= dia.desde
    and v.fecha_hora < dia.hasta
) ve on true
left join lateral (
  select sum(pf.monto) as total
  from pagos_fiados pf
  join metodos_pago mp on mp.id = pf.metodo_pago_id
  where pf.sucursal_id = cc.sucursal_id
    and mp.nombre = 'Efectivo'
    and pf.fecha >= dia.desde
    and pf.fecha < dia.hasta
) fi on true
left join lateral (
  select sum(g.monto) as total
  from gastos g
  join metodos_pago mp on mp.id = g.metodo_pago_id
  where g.sucursal_id = cc.sucursal_id
    and mp.nombre = 'Efectivo'
    and g.fecha >= dia.desde
    and g.fecha < dia.hasta
) ga on true
left join lateral (
  select sum(pp2.monto) as total
  from pagos_proveedor pp2
  join metodos_pago mp on mp.id = pp2.metodo_pago_id
  where pp2.sucursal_id = cc.sucursal_id
    and mp.nombre = 'Efectivo'
    and pp2.fecha >= dia.desde
    and pp2.fecha < dia.hasta
) pp on true
left join lateral (
  select sum(r.monto) as total
  from retiros_caja r
  where r.sucursal_id = cc.sucursal_id
    and r.fecha >= dia.desde
    and r.fecha < dia.hasta
) re on true
where cc.fecha_cierre is not null;

grant select on historial_cierres_caja to authenticated;

commit;

notify pgrst, 'reload schema';
