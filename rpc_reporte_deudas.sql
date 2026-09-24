-- =========================================================
-- Reporte 5 (pantalla Reportes, solo dueño): deuda a proveedores +
-- saldo de fiados, consolidado. A diferencia de los reportes 1-4, este
-- NO usa rango de fechas -- son saldos en tiempo real (cuánto se debe
-- HOY), calculados igual que ya hace Fiados.jsx para clientes
-- (sum ventas activas a fiado - sum pagos_fiados) y con el mismo
-- criterio para proveedores (sum compras confirmadas - sum
-- pagos_proveedor).
--
-- Nota de contexto (no bloqueante): desde que confirmar_pedido_compra
-- genera el pago a proveedor automáticamente al confirmar (modelo
-- contado), una compra nueva casi nunca debería dejar saldo pendiente
-- -- este reporte va a mostrar deuda real solo en compras viejas
-- (previas a ese cambio) o si algún pago se borra/edita a mano. Igual
-- se calcula tal cual lo pediste, en tiempo real, sin asumir que da 0.
--
-- Solo se devuelven proveedores/clientes con saldo distinto de 0
-- (redondeo de centavos incluido) -- una lista de deudores en $0 no
-- aporta nada a esta pantalla.
--
-- security definer + auth_rol() = 'dueño', mismo criterio que los
-- reportes anteriores.
-- =========================================================

create or replace function reporte_deudas(p_sucursal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proveedores jsonb;
  v_fiados jsonb;
begin
  if auth_rol() <> 'dueño' then
    raise exception 'No autorizado';
  end if;

  select coalesce(jsonb_agg(x order by x.saldo desc), '[]'::jsonb)
    into v_proveedores
    from (
      select
        pr.id as proveedor_id,
        pr.nombre as proveedor_nombre,
        coalesce(cp.total, 0) - coalesce(pp.total, 0) as saldo
      from proveedores pr
      left join (
        select proveedor_id, sum(monto_total) as total
        from compras_proveedor
        where sucursal_id = p_sucursal_id and estado = 'confirmada'
        group by proveedor_id
      ) cp on cp.proveedor_id = pr.id
      left join (
        select proveedor_id, sum(monto) as total
        from pagos_proveedor
        where sucursal_id = p_sucursal_id
        group by proveedor_id
      ) pp on pp.proveedor_id = pr.id
      where pr.sucursal_id = p_sucursal_id
        and abs(coalesce(cp.total, 0) - coalesce(pp.total, 0)) > 0.01
    ) x;

  select coalesce(jsonb_agg(x order by x.saldo desc), '[]'::jsonb)
    into v_fiados
    from (
      select
        cf.id as cliente_id,
        cf.nombre as cliente_nombre,
        coalesce(v.total, 0) - coalesce(p.total, 0) as saldo
      from clientes_fiados cf
      left join (
        select cliente_fiado_id, sum(total_neto) as total
        from ventas
        where sucursal_id = p_sucursal_id and estado = 'activa' and cliente_fiado_id is not null
        group by cliente_fiado_id
      ) v on v.cliente_fiado_id = cf.id
      left join (
        select cliente_fiado_id, sum(monto) as total
        from pagos_fiados
        where sucursal_id = p_sucursal_id
        group by cliente_fiado_id
      ) p on p.cliente_fiado_id = cf.id
      where cf.sucursal_id = p_sucursal_id
        and abs(coalesce(v.total, 0) - coalesce(p.total, 0)) > 0.01
    ) x;

  return jsonb_build_object(
    'deuda_proveedores', v_proveedores,
    'saldo_fiados', v_fiados
  );
end;
$$;

grant execute on function reporte_deudas(uuid) to authenticated;
