import { useState } from 'react'
import { cantidadValida } from './precios'

// Input de cantidad con decimales. Mientras se escribe guarda el texto tal
// cual, porque "1." o "" no son números todavía y no se pueden pisar; solo
// avisa las cantidades válidas. Al salir vuelve a la última que lo fue.
export function InputCantidad({ value, onChange, className, ...props }) {
  const [borrador, setBorrador] = useState(null)

  function alEscribir(e) {
    setBorrador(e.target.value)
    const cantidad = cantidadValida(e.target.value)
    if (cantidad !== null) onChange(cantidad)
  }

  return (
    <input
      {...props}
      type="number"
      min="0.1"
      max="200"
      step="0.1"
      inputMode="decimal"
      className={className}
      value={borrador ?? value}
      onChange={alEscribir}
      onBlur={() => setBorrador(null)}
    />
  )
}
