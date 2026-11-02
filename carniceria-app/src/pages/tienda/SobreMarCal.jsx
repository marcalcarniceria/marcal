import { Revelar } from './Revelar'

// Sección "Sobre Mar-Cal" de compu y de mobile. Va dentro de un RevelarProvider.
export function SobreMarCal() {
  return (
    <div id="seccion-nosotros" className="tienda-nosotros">
      <div className="tienda-nosotros-inner">
        <Revelar className="tienda-nosotros-card">
          <h2>Sobre Mar-Cal</h2>
          <p>
            Somos una carnicería y verdulería de barrio en Arenales 345, Barrio Juniors.
            Trabajamos todos los días para ofrecerte carne, frutas y verduras de primera
            calidad, con el trato de siempre.
          </p>
          <p>
            Hacé tu pedido por WhatsApp o directo acá en la tienda, y coordinamos la entrega
            por tu zona.
          </p>
        </Revelar>
      </div>
    </div>
  )
}
