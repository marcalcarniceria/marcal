// Tarjeta de combo para la vidriera. `combo` es una fila de
// obtener_combos_tienda (schema_combos.sql): precio_fijo, imagen_url e
// ingredientes [{ producto_nombre, unidad_nombre, cantidad }]. La tienda
// solo muestra los disponibles (Tienda.jsx filtra por `disponible`).
function textoIngredientes(ingredientes) {
  return ingredientes
    .map((i) => `${Number(i.cantidad)} ${i.unidad_nombre} de ${i.producto_nombre}`)
    .join(', ')
}

// Recibe el combo como `item` porque así lo pasa CategoriaBloque (prop Card).
export function ComboCard({ item: combo, agregarItem, className = '' }) {
  return (
    <div className={`tienda-card tienda-combo-card ${className}`.trim()}>
      {combo.imagen_url && (
        <img src={combo.imagen_url} alt={combo.nombre} className="tienda-combo-imagen" loading="lazy" />
      )}
      <span className="tienda-card-oferta">Combo</span>
      <h3>{combo.nombre}</h3>
      {combo.descripcion && <p className="tienda-combo-descripcion">{combo.descripcion}</p>}
      {combo.ingredientes.length > 0 && (
        <p className="tienda-combo-incluye">
          <strong>Incluye:</strong> {textoIngredientes(combo.ingredientes)}
        </p>
      )}
      <div className="tienda-card-unidad">
        <div className="tienda-card-precio">${Number(combo.precio_fijo).toFixed(2)}</div>
        <button
          type="button"
          className="tienda-btn"
          onClick={() =>
            agregarItem({
              combo_id: combo.id,
              producto_nombre: combo.nombre,
              unidad_nombre: 'Combo',
              precio_venta: Number(combo.precio_fijo),
            })
          }
        >
          Agregar
        </button>
      </div>
    </div>
  )
}
