import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { SUCURSAL_ID } from '../config/sucursal'
import { telefonoValidoWhatsApp, linkWhatsApp } from '../lib/whatsapp'

export function Proveedores() {
  const navigate = useNavigate()

  const [proveedores, setProveedores] = useState([])
  const [proveedoresConCompras, setProveedoresConCompras] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [repitiendoId, setRepitiendoId] = useState(null)

  async function fetchProveedores() {
    setLoading(true)
    const [proveedoresRes, comprasRes] = await Promise.all([
      supabase.from('proveedores').select('*').eq('sucursal_id', SUCURSAL_ID).order('nombre'),
      supabase.from('compras_proveedor').select('proveedor_id').eq('sucursal_id', SUCURSAL_ID),
    ])

    if (proveedoresRes.error) setError(proveedoresRes.error)
    else if (comprasRes.error) setError(comprasRes.error)
    else {
      setProveedores(proveedoresRes.data)
      setProveedoresConCompras(new Set(comprasRes.data.map((c) => c.proveedor_id)))
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchProveedores()
  }, [])

  async function repetirUltimaCompra(proveedorId) {
    setMensaje(null)
    setRepitiendoId(proveedorId)

    const { data: ultimaCompra, error: errorCompra } = await supabase
      .from('compras_proveedor')
      .select('id')
      .eq('proveedor_id', proveedorId)
      .eq('sucursal_id', SUCURSAL_ID)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (errorCompra || !ultimaCompra) {
      setRepitiendoId(null)
      setMensaje({
        tipo: 'error',
        texto: errorCompra?.message ?? 'No se encontró ninguna compra previa a este proveedor.',
      })
      return
    }

    const { data: detalle, error: errorDetalle } = await supabase
      .from('detalle_compras')
      .select('producto_id, unidad_venta_id, cantidad, productos(nombre), unidades_venta_producto(nombre_unidad)')
      .eq('compra_id', ultimaCompra.id)

    setRepitiendoId(null)

    if (errorDetalle) {
      setMensaje({ tipo: 'error', texto: errorDetalle.message })
      return
    }

    // Va al Panel 1 ("Pedido a enviar") de la pantalla de compras: ahí no
    // hace falta precio, solo producto/unidad/cantidad como base editable.
    const pedidoInicial = detalle.map((d, i) => ({
      key: `${d.producto_id}-${d.unidad_venta_id}-${i}-${Date.now()}`,
      producto_id: d.producto_id,
      producto_nombre: d.productos?.nombre ?? '—',
      unidad_venta_id: d.unidad_venta_id,
      unidad_nombre: d.unidades_venta_producto?.nombre_unidad ?? '—',
      cantidad: Number(d.cantidad),
    }))

    navigate('/compras', { state: { proveedorId, pedidoInicial } })
  }

  async function crearProveedor() {
    setMensaje(null)

    if (!nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'El nombre es obligatorio.' })
      return
    }

    setGuardando(true)
    const { error } = await supabase.from('proveedores').insert({
      nombre: nombre.trim(),
      telefono: telefono.trim() || null,
      sucursal_id: SUCURSAL_ID,
    })
    setGuardando(false)

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }

    setNombre('')
    setTelefono('')
    setMensaje({ tipo: 'exito', texto: 'Proveedor creado.' })
    fetchProveedores()
  }

  async function eliminarProveedor(id) {
    const { error } = await supabase.from('proveedores').delete().eq('id', id)
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }
    fetchProveedores()
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1>Proveedores</h1>

      <div className="staff-card">
        <h2>Nuevo proveedor</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <input
            type="text"
            placeholder="Teléfono con código de país (ej: 549351...)"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            style={{ width: 260 }}
          />
          <button type="button" className="staff-btn" onClick={crearProveedor} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar proveedor'}
          </button>
        </div>

        {mensaje && (
          <p
            className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'}
            style={{ marginTop: '0.75rem' }}
          >
            {mensaje.texto}
          </p>
        )}
      </div>

      {error && (
        <div className="staff-card">
          <h2>Error al consultar Supabase</h2>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}

      {loading && <p>Cargando...</p>}

      {!loading && !error && (
        <div className="staff-card">
          {proveedores.length === 0 && <p>No hay proveedores cargados.</p>}
          {proveedores.length > 0 && (
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th></th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {proveedores.map((p) => {
                  const valido = telefonoValidoWhatsApp(p.telefono)
                  const tieneCompras = proveedoresConCompras.has(p.id)
                  return (
                    <tr key={p.id}>
                      <td>{p.nombre}</td>
                      <td>{p.telefono || '—'}</td>
                      <td>
                        {valido ? (
                          <a
                            href={linkWhatsApp(p.telefono)}
                            target="_blank"
                            rel="noreferrer"
                            className="staff-btn staff-btn-secundario"
                          >
                            Contactar por WhatsApp
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="staff-btn staff-btn-secundario"
                            disabled
                            title="El teléfono necesita el código de país (ej: 549351...) para generar el link de WhatsApp."
                          >
                            Contactar por WhatsApp
                          </button>
                        )}
                      </td>
                      <td>
                        {tieneCompras ? (
                          <button
                            type="button"
                            className="staff-btn staff-btn-secundario"
                            onClick={() => repetirUltimaCompra(p.id)}
                            disabled={repitiendoId === p.id}
                          >
                            {repitiendoId === p.id ? 'Cargando...' : 'Repetir última compra'}
                          </button>
                        ) : (
                          <button type="button" className="staff-btn staff-btn-secundario" disabled title="Sin compras previas a este proveedor">
                            Sin compras previas a este proveedor
                          </button>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="staff-btn staff-btn-secundario"
                          onClick={() => eliminarProveedor(p.id)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
