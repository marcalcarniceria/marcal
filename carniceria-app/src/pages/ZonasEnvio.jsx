import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { SUCURSAL_ID } from '../config/sucursal'
import { ConfirmModal } from '../components/ConfirmModal'

// Solo informativo (ver nota en el card de config): ida y vuelta, litros
// cada 100km convertidos a litros/km, por el precio de la nafta.
function costoNaftaEstimado(distanciaKm, config) {
  if (distanciaKm == null || !config) return null
  return Number(distanciaKm) * 2 * (Number(config.litros_cada_100km) / 100) * Number(config.precio_nafta_litro)
}

function zonaVacia() {
  return { nombre: '', costo_envio: '', distancia_km: '', activa: true }
}

export function ZonasEnvio() {
  const [zonas, setZonas] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [mostrarForm, setMostrarForm] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(zonaVacia())
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  const [litrosCada100km, setLitrosCada100km] = useState('')
  const [precioNaftaLitro, setPrecioNaftaLitro] = useState('')
  const [guardandoConfig, setGuardandoConfig] = useState(false)
  const [mensajeConfig, setMensajeConfig] = useState(null)

  const [origenLat, setOrigenLat] = useState('')
  const [origenLng, setOrigenLng] = useState('')
  const [guardandoOrigen, setGuardandoOrigen] = useState(false)
  const [mensajeOrigen, setMensajeOrigen] = useState(null)

  const [calculandoDistancia, setCalculandoDistancia] = useState(false)
  const [resultadoDistancia, setResultadoDistancia] = useState(null)

  const [textoMasivo, setTextoMasivo] = useState('')
  const [cargandoMasivo, setCargandoMasivo] = useState(false)
  const [resultadoMasivo, setResultadoMasivo] = useState(null)

  const [zonaAEliminar, setZonaAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  async function fetchTodo() {
    setLoading(true)
    setError(null)

    const [zonasRes, configRes] = await Promise.all([
      supabase.from('zonas_envio').select('*').eq('sucursal_id', SUCURSAL_ID).order('nombre'),
      supabase.from('config_envios').select('*').maybeSingle(),
    ])

    if (zonasRes.error) setError(zonasRes.error)
    else if (configRes.error) setError(configRes.error)
    else {
      setZonas(zonasRes.data)
      setConfig(configRes.data)
      if (configRes.data) {
        setLitrosCada100km(String(configRes.data.litros_cada_100km))
        setPrecioNaftaLitro(String(configRes.data.precio_nafta_litro))
        setOrigenLat(configRes.data.origen_lat == null ? '' : String(configRes.data.origen_lat))
        setOrigenLng(configRes.data.origen_lng == null ? '' : String(configRes.data.origen_lng))
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchTodo()
  }, [])

  function actualizarForm(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  function iniciarEdicion(zona) {
    setEditandoId(zona.id)
    setForm({
      nombre: zona.nombre,
      costo_envio: String(zona.costo_envio),
      distancia_km: zona.distancia_km == null ? '' : String(zona.distancia_km),
      activa: zona.activa,
    })
    setMostrarForm(true)
    setMensaje(null)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setEditandoId(null)
    setForm(zonaVacia())
    setMensaje(null)
  }

  async function guardarZona() {
    setMensaje(null)

    if (!form.nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'Falta el nombre de la zona.' })
      return
    }
    if (form.costo_envio === '' || Number(form.costo_envio) < 0) {
      setMensaje({ tipo: 'error', texto: 'Falta el costo de envío.' })
      return
    }

    const payload = {
      nombre: form.nombre.trim(),
      costo_envio: Number(form.costo_envio),
      distancia_km: form.distancia_km === '' ? null : Number(form.distancia_km),
      activa: form.activa,
    }

    setGuardando(true)
    const { error: errorGuardar } = editandoId
      ? await supabase.from('zonas_envio').update(payload).eq('id', editandoId)
      : await supabase.from('zonas_envio').insert({ ...payload, sucursal_id: SUCURSAL_ID })
    setGuardando(false)

    if (errorGuardar) {
      setMensaje({ tipo: 'error', texto: errorGuardar.message })
      return
    }

    setMensaje({ tipo: 'exito', texto: editandoId ? 'Zona actualizada.' : 'Zona creada.' })
    cancelarForm()
    fetchTodo()
  }

  async function confirmarEliminarZona() {
    if (!zonaAEliminar) return
    setEliminando(true)
    const { error: errorEliminar } = await supabase.from('zonas_envio').delete().eq('id', zonaAEliminar.id)
    setEliminando(false)
    setZonaAEliminar(null)

    if (errorEliminar) {
      setMensaje({ tipo: 'error', texto: errorEliminar.message })
      return
    }
    fetchTodo()
  }

  async function guardarConfig() {
    setMensajeConfig(null)

    if (litrosCada100km === '' || precioNaftaLitro === '') {
      setMensajeConfig({ tipo: 'error', texto: 'Completá los dos valores.' })
      return
    }

    setGuardandoConfig(true)
    const { error: errorConfig } = await supabase
      .from('config_envios')
      .update({
        litros_cada_100km: Number(litrosCada100km),
        precio_nafta_litro: Number(precioNaftaLitro),
      })
      .eq('id', config.id)
    setGuardandoConfig(false)

    if (errorConfig) {
      setMensajeConfig({ tipo: 'error', texto: errorConfig.message })
      return
    }

    setMensajeConfig({ tipo: 'exito', texto: 'Configuración guardada.' })
    fetchTodo()
  }

  async function guardarOrigen() {
    setMensajeOrigen(null)

    if (origenLat === '' || origenLng === '') {
      setMensajeOrigen({ tipo: 'error', texto: 'Completá latitud y longitud.' })
      return
    }

    setGuardandoOrigen(true)
    const { error: errorOrigen } = await supabase
      .from('config_envios')
      .update({ origen_lat: Number(origenLat), origen_lng: Number(origenLng) })
      .eq('id', config.id)
    setGuardandoOrigen(false)

    if (errorOrigen) {
      setMensajeOrigen({ tipo: 'error', texto: errorOrigen.message })
      return
    }

    setMensajeOrigen({ tipo: 'exito', texto: 'Origen guardado.' })
    fetchTodo()
  }

  // Geocodifica form.nombre y completa distancia_km del formulario --
  // nunca bloquea el guardado de la zona: si falla, solo se ve el
  // mensaje de error y el campo queda como estaba para completar a mano.
  async function calcularDistanciaZona() {
    setResultadoDistancia(null)

    if (!form.nombre.trim()) {
      setResultadoDistancia({ ok: false, error: 'Escribí primero el nombre de la zona.' })
      return
    }

    setCalculandoDistancia(true)
    const { data, error: errorFn } = await supabase.functions.invoke('calcular_distancia_zona', {
      body: { nombre_zona: form.nombre.trim() },
    })
    setCalculandoDistancia(false)

    if (errorFn) {
      setResultadoDistancia({ ok: false, error: errorFn.message })
      return
    }
    if (!data.ok) {
      setResultadoDistancia({ ok: false, error: data.error })
      return
    }

    const resultado = data.resultados[0]
    if (!resultado.encontrado) {
      setResultadoDistancia({ ok: false, error: resultado.error })
      return
    }

    actualizarForm('distancia_km', String(resultado.distancia_km))
    setResultadoDistancia({
      ok: true,
      texto: `${resultado.distancia_km} km -- coincidencia: "${resultado.label}"${
        resultado.confidence != null && resultado.confidence < 0.8 ? ' (confianza baja, verificá el resultado)' : ''
      }`,
    })
  }

  async function cargarMasivo() {
    setResultadoMasivo(null)

    const nombres = textoMasivo
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean)

    if (nombres.length === 0) {
      setResultadoMasivo({ ok: false, resumen: 'Pegá al menos un nombre de barrio.' })
      return
    }

    setCargandoMasivo(true)
    const { data, error: errorFn } = await supabase.functions.invoke('calcular_distancia_zona', {
      body: { nombres_zona: nombres },
    })

    if (errorFn || !data.ok) {
      setCargandoMasivo(false)
      setResultadoMasivo({ ok: false, resumen: errorFn?.message ?? data.error })
      return
    }

    const encontrados = data.resultados.filter((r) => r.encontrado)
    if (encontrados.length > 0) {
      await supabase.from('zonas_envio').insert(
        encontrados.map((r) => ({
          sucursal_id: SUCURSAL_ID,
          nombre: r.nombre_zona,
          costo_envio: 0,
          distancia_km: r.distancia_km,
          activa: true,
        })),
      )
    }

    setCargandoMasivo(false)
    setResultadoMasivo({ ok: true, detalle: data.resultados })
    setTextoMasivo('')
    fetchTodo()
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <h1>Zonas de envío</h1>

      <div className="staff-card">
        <h2>Costo de nafta estimado</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Solo informativo, para ayudarte a decidir cuánto cobrar por cada zona -- el checkout de la
          tienda sigue usando el "Costo de envío" que cargues abajo, esto no lo reemplaza.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            Litros cada 100km
            <input
              type="number"
              min="0"
              step="0.1"
              value={litrosCada100km}
              onChange={(e) => setLitrosCada100km(e.target.value)}
              style={{ width: 140 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            Precio de la nafta ($/litro)
            <input
              type="number"
              min="0"
              step="0.01"
              value={precioNaftaLitro}
              onChange={(e) => setPrecioNaftaLitro(e.target.value)}
              style={{ width: 140 }}
            />
          </label>
          <button type="button" className="staff-btn" onClick={guardarConfig} disabled={guardandoConfig}>
            {guardandoConfig ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
        {mensajeConfig && (
          <p
            className={mensajeConfig.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'}
            style={{ marginTop: '0.5rem' }}
          >
            {mensajeConfig.texto}
          </p>
        )}
      </div>

      <div className="staff-card">
        <h2>Origen del local (Arenales 345, Barrio Juniors)</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Coordenadas desde donde se calcula la distancia a cada zona. Se cargó un valor aproximado
          automáticamente -- la geocodificación de la dirección exacta no es 100% confiable, así que
          conviene verificarlo una vez copiando las coordenadas exactas del local desde Google Maps
          (click derecho sobre el local → el primer número que aparece).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            Latitud
            <input
              type="number"
              step="0.000001"
              value={origenLat}
              onChange={(e) => setOrigenLat(e.target.value)}
              style={{ width: 160 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            Longitud
            <input
              type="number"
              step="0.000001"
              value={origenLng}
              onChange={(e) => setOrigenLng(e.target.value)}
              style={{ width: 160 }}
            />
          </label>
          <button type="button" className="staff-btn" onClick={guardarOrigen} disabled={guardandoOrigen}>
            {guardandoOrigen ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
        {mensajeOrigen && (
          <p
            className={mensajeOrigen.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'}
            style={{ marginTop: '0.5rem' }}
          >
            {mensajeOrigen.texto}
          </p>
        )}
      </div>

      <div className="staff-card">
        <button
          type="button"
          className="staff-btn"
          onClick={() => (mostrarForm ? cancelarForm() : setMostrarForm(true))}
        >
          {mostrarForm ? 'Cancelar' : '+ Nueva zona'}
        </button>

        {mostrarForm && (
          <div style={{ marginTop: '1rem' }}>
            {editandoId && <p className="staff-badge staff-badge-pendiente">Editando zona existente</p>}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                Nombre
                <input
                  type="text"
                  placeholder="Ej: Barrio Juniors"
                  value={form.nombre}
                  onChange={(e) => actualizarForm('nombre', e.target.value)}
                  style={{ width: 220 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                Costo de envío ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.costo_envio}
                  onChange={(e) => actualizarForm('costo_envio', e.target.value)}
                  style={{ width: 140 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                Distancia (km)
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.distancia_km}
                    onChange={(e) => actualizarForm('distancia_km', e.target.value)}
                    style={{ width: 100 }}
                  />
                  <button
                    type="button"
                    className="staff-btn-secundario staff-btn"
                    onClick={calcularDistanciaZona}
                    disabled={calculandoDistancia}
                    title="Geocodifica el nombre de la zona y calcula la distancia por calle desde el local"
                  >
                    {calculandoDistancia ? 'Calculando...' : 'Calcular'}
                  </button>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '1.4rem' }}>
                <input
                  type="checkbox"
                  checked={form.activa}
                  onChange={(e) => actualizarForm('activa', e.target.checked)}
                />
                Activa
              </label>
            </div>

            {resultadoDistancia && (
              <p
                className={resultadoDistancia.ok ? 'staff-mensaje-exito' : 'staff-mensaje-error'}
                style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}
              >
                {resultadoDistancia.ok ? resultadoDistancia.texto : resultadoDistancia.error}
              </p>
            )}

            <button type="button" className="staff-btn" onClick={guardarZona} disabled={guardando} style={{ marginTop: '0.75rem' }}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar zona'}
            </button>
          </div>
        )}

        {mensaje && (
          <p className={mensaje.tipo === 'error' ? 'staff-mensaje-error' : 'staff-mensaje-exito'} style={{ marginTop: '0.75rem' }}>
            {mensaje.texto}
          </p>
        )}
      </div>

      <div className="staff-card">
        <h2>Carga masiva de zonas</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Un nombre de barrio por línea. Crea una zona por cada uno con la distancia ya calculada --
          el costo de envío queda en $0, completalo a mano después (eso lo decidís vos, no la API).
          OpenRouteService tiene un cupo diario limitado de geocodificación: evitá cargar listas
          enormes de una sola vez.
        </p>
        <textarea
          value={textoMasivo}
          onChange={(e) => setTextoMasivo(e.target.value)}
          placeholder={'Alta Córdoba\nNueva Córdoba\nGüemes'}
          rows={5}
          style={{ width: '100%', maxWidth: 400 }}
        />
        <div>
          <button
            type="button"
            className="staff-btn"
            onClick={cargarMasivo}
            disabled={cargandoMasivo}
            style={{ marginTop: '0.5rem' }}
          >
            {cargandoMasivo ? 'Procesando...' : 'Cargar zonas'}
          </button>
        </div>

        {resultadoMasivo && !resultadoMasivo.ok && (
          <p className="staff-mensaje-error" style={{ marginTop: '0.5rem' }}>
            {resultadoMasivo.resumen}
          </p>
        )}

        {resultadoMasivo?.ok && (
          <ul style={{ marginTop: '0.75rem', fontSize: '0.85rem', paddingLeft: '1.2rem' }}>
            {resultadoMasivo.detalle.map((r) => (
              <li key={r.nombre_zona} className={r.encontrado ? '' : 'staff-mensaje-error'}>
                {r.nombre_zona}: {r.encontrado ? `creada, ${r.distancia_km} km ("${r.label}")` : r.error}
              </li>
            ))}
          </ul>
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
          {zonas.length === 0 && <p>No hay zonas cargadas.</p>}
          {zonas.length > 0 && (
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Costo de envío</th>
                  <th>Distancia</th>
                  <th>Nafta estimada</th>
                  <th>Estado</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {zonas.map((z) => {
                  const nafta = costoNaftaEstimado(z.distancia_km, config)
                  return (
                    <tr key={z.id}>
                      <td>{z.nombre}</td>
                      <td>${Number(z.costo_envio).toFixed(2)}</td>
                      <td>{z.distancia_km == null ? '—' : `${z.distancia_km} km`}</td>
                      <td>{nafta == null ? '—' : `$${nafta.toFixed(2)}`}</td>
                      <td>
                        <span className={`staff-badge ${z.activa ? 'staff-badge-exito' : ''}`}>
                          {z.activa ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td>
                        <button type="button" className="staff-btn staff-btn-secundario" onClick={() => iniciarEdicion(z)}>
                          Editar
                        </button>
                      </td>
                      <td>
                        <button type="button" className="staff-btn staff-btn-secundario" onClick={() => setZonaAEliminar(z)}>
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

      <ConfirmModal
        abierto={Boolean(zonaAEliminar)}
        titulo="Eliminar zona"
        mensaje={`¿Eliminar la zona "${zonaAEliminar?.nombre}"? Esta acción no se puede deshacer.`}
        procesando={eliminando}
        onConfirmar={confirmarEliminarZona}
        onCancelar={() => setZonaAEliminar(null)}
      />
    </div>
  )
}
