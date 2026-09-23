import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { SUCURSAL_ID } from '../config/sucursal'

function lineaVacia() {
  return { producto_destino_id: '', porcentaje_rendimiento: '' }
}

export function PlantillasDespiece() {
  const [plantillas, setPlantillas] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [mostrarForm, setMostrarForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [lineas, setLineas] = useState([lineaVacia()])

  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  async function fetchTodo() {
    setLoading(true)
    const [plantillasRes, productosRes] = await Promise.all([
      supabase
        .from('plantillas_despiece')
        .select('*, plantillas_despiece_detalle(id, porcentaje_rendimiento, producto_destino_id, productos(nombre))')
        .order('nombre'),
      supabase.from('productos').select('id, nombre').eq('sucursal_id', SUCURSAL_ID).eq('activo', true).order('nombre'),
    ])

    if (plantillasRes.error) setError(plantillasRes.error)
    else if (productosRes.error) setError(productosRes.error)
    else {
      setPlantillas(plantillasRes.data)
      setProductos(productosRes.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchTodo()
  }, [])

  function resetForm() {
    setNombre('')
    setLineas([lineaVacia()])
    setMensaje(null)
  }

  function agregarLinea() {
    setLineas((prev) => [...prev, lineaVacia()])
  }

  function actualizarLinea(index, campo, valor) {
    setLineas((prev) => prev.map((l, i) => (i === index ? { ...l, [campo]: valor } : l)))
  }

  function quitarLinea(index) {
    setLineas((prev) => prev.filter((_, i) => i !== index))
  }

  const sumaPorcentajes = lineas.reduce((acc, l) => acc + (Number(l.porcentaje_rendimiento) || 0), 0)

  async function guardarPlantilla() {
    setMensaje(null)

    if (!nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'Falta el nombre de la plantilla.' })
      return
    }

    const lineasValidas = lineas.filter((l) => l.producto_destino_id && Number(l.porcentaje_rendimiento) > 0)

    if (lineasValidas.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Agregá al menos un producto destino con % de rendimiento.' })
      return
    }

    const suma = lineasValidas.reduce((acc, l) => acc + Number(l.porcentaje_rendimiento), 0)
    if (suma > 100) {
      setMensaje({ tipo: 'error', texto: `La suma de rendimiento no puede superar 100% (actual: ${suma}%).` })
      return
    }

    setGuardando(true)
    const { error } = await supabase.rpc('crear_plantilla_despiece', {
      p_nombre: nombre.trim(),
      p_detalle: lineasValidas.map((l) => ({
        producto_destino_id: l.producto_destino_id,
        porcentaje_rendimiento: Number(l.porcentaje_rendimiento),
      })),
    })
    setGuardando(false)

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }

    setMensaje({ tipo: 'exito', texto: 'Plantilla creada.' })
    resetForm()
    setMostrarForm(false)
    fetchTodo()
  }

  async function eliminarPlantilla(id) {
    const { error } = await supabase.from('plantillas_despiece').delete().eq('id', id)
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }
    fetchTodo()
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1>Plantillas de despiece</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
        Reparten el peso y costo de una compra (ej. media res) entre varios productos destino según
        un % de rendimiento fijo, para no tener que cargar cada corte a mano en cada compra. Cada
        producto destino tiene que tener una unidad de venta medida en kilos (factor de conversión 1).
      </p>

      <div className="staff-card">
        <button
          type="button"
          className="staff-btn"
          onClick={() => {
            if (mostrarForm) {
              resetForm()
              setMostrarForm(false)
            } else {
              setMostrarForm(true)
            }
          }}
        >
          {mostrarForm ? 'Cancelar' : '+ Nueva plantilla'}
        </button>

        {mostrarForm && (
          <div style={{ marginTop: '1rem' }}>
            <input
              type="text"
              placeholder="Nombre (ej: Media Res)"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              style={{ marginBottom: '0.75rem', width: 280 }}
            />

            <table className="staff-table">
              <thead>
                <tr>
                  <th>Producto destino</th>
                  <th>% rendimiento</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        value={linea.producto_destino_id}
                        onChange={(e) => actualizarLinea(i, 'producto_destino_id', e.target.value)}
                      >
                        <option value="">Seleccionar producto...</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={linea.porcentaje_rendimiento}
                        onChange={(e) => actualizarLinea(i, 'porcentaje_rendimiento', e.target.value)}
                        style={{ width: 90 }}
                      />
                    </td>
                    <td>
                      <button type="button" className="staff-btn staff-btn-secundario" onClick={() => quitarLinea(i)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button type="button" className="staff-btn staff-btn-secundario" onClick={agregarLinea} style={{ marginTop: '0.5rem' }}>
              + Otro producto destino
            </button>

            <p
              className={sumaPorcentajes > 100 ? 'staff-mensaje-error' : ''}
              style={{ marginTop: '0.75rem' }}
            >
              Suma de rendimiento: {sumaPorcentajes}%{sumaPorcentajes > 100 ? ' — supera el 100%' : ''}
            </p>

            {mensaje && (
              <p className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'}>
                {mensaje.texto}
              </p>
            )}

            <button type="button" className="staff-btn" onClick={guardarPlantilla} disabled={guardando} style={{ marginTop: '0.5rem' }}>
              {guardando ? 'Guardando...' : 'Guardar plantilla'}
            </button>
          </div>
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
          {plantillas.length === 0 && <p>No hay plantillas cargadas.</p>}
          {plantillas.map((plantilla) => (
            <div key={plantilla.id} style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h2 style={{ margin: 0 }}>{plantilla.nombre}</h2>
                <button
                  type="button"
                  className="staff-btn staff-btn-secundario"
                  onClick={() => eliminarPlantilla(plantilla.id)}
                >
                  Eliminar plantilla
                </button>
              </div>
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Producto destino</th>
                    <th>% rendimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {plantilla.plantillas_despiece_detalle.map((d) => (
                    <tr key={d.id}>
                      <td>{d.productos?.nombre ?? '—'}</td>
                      <td>{d.porcentaje_rendimiento}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
