-- =========================================================
-- Fiados: límite de crédito por cliente.
--
-- 1) clientes_fiados.limite_credito (null o 0 = sin límite).
-- 2) Validación en la BASE, no solo en la caja: un trigger sobre ventas
--    rechaza cualquier venta fiada que deje el saldo del cliente por
--    encima de su límite.
--
-- Por qué trigger y no reescribir registrar_venta: registrar_venta
-- (schema_combos_snapshot.sql, ~230 líneas) inserta la venta con total 0
-- y al final hace UPDATE de total_neto -- el trigger se dispara en ese
-- UPDATE, con el total real, y aborta toda la transacción (la venta, sus
-- líneas y el descuento de stock se deshacen juntos). También cubre
-- cualquier otro camino futuro que escriba ventas fiadas.
--
-- Saldo = ventas fiadas 'activa' del cliente - pagos_fiados (mismo
-- cálculo que Fiados.jsx y reporte_deudas). Solo se valida cuando la
-- deuda CRECE: anular una venta o bajar un total nunca se bloquea.
--
-- Correr completo en el SQL Editor de Supabase. Idempotente.
-- =========================================================

begin;

alter table clientes_fiados add column if not exists limite_credito numeric;

alter table clientes_fiados drop constraint if exists clientes_fiados_limite_credito_check;
alter table clientes_fiados
  add constraint clientes_fiados_limite_credito_check
  check (limite_credito is null or limite_credito >= 0);

create or replace function trg_validar_limite_credito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite numeric;
  v_nombre text;
  v_saldo_otros numeric;
begin
  if new.cliente_fiado_id is null or new.estado <> 'activa' then
    return new;
  end if;

  -- Si la deuda de esta venta no crece (mismo cliente, total igual o
  -- menor, ya estaba activa), no hay nada que validar.
  if tg_op = 'UPDATE'
     and old.cliente_fiado_id is not distinct from new.cliente_fiado_id
     and old.estado = 'activa'
     and coalesce(new.total_neto, 0) <= coalesce(old.total_neto, 0) then
    return new;
  end if;

  -- FOR UPDATE: dos ventas fiadas simultáneas al mismo cliente se
  -- validan de a una (si no, las dos podrían pasar cada una por
  -- separado y juntas superar el límite).
  select limite_credito, nombre
    into v_limite, v_nombre
    from clientes_fiados
    where id = new.cliente_fiado_id
    for update;

  if v_limite is null or v_limite <= 0 then
    return new;
  end if;

  select
    coalesce((select sum(v.total_neto) from ventas v
              where v.cliente_fiado_id = new.cliente_fiado_id
                and v.estado = 'activa'
                and v.id <> new.id), 0)
    - coalesce((select sum(pf.monto) from pagos_fiados pf
                where pf.cliente_fiado_id = new.cliente_fiado_id), 0)
    into v_saldo_otros;

  if v_saldo_otros + coalesce(new.total_neto, 0) > v_limite + 0.009 then
    raise exception 'El cliente % superará su límite de crédito de $% (saldo actual $%, esta venta $%)',
      v_nombre,
      to_char(v_limite, 'FM999999990.00'),
      to_char(v_saldo_otros, 'FM999999990.00'),
      to_char(coalesce(new.total_neto, 0), 'FM999999990.00');
  end if;

  return new;
end;
$$;

drop trigger if exists ventas_validar_limite_credito on ventas;
create trigger ventas_validar_limite_credito
  before insert or update of total_neto, cliente_fiado_id, estado on ventas
  for each row
  execute function trg_validar_limite_credito();

commit;

notify pgrst, 'reload schema';
