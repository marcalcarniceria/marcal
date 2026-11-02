import { LazyMotion, MotionConfig, domAnimation, m } from 'framer-motion'

// Animaciones de aparición al hacer scroll de la tienda de compu.
// RevelarProvider: va una sola vez, envolviendo la página. LazyMotion carga
// solo lo que se usa acá, y reducedMotion="user" saca el desplazamiento si
// el cliente pidió menos movimiento en su sistema (queda solo el fundido).
// once: false: al salir de pantalla el elemento vuelve a ocultarse, y la
// animación se repite la próxima vez que entra (en las dos direcciones).
const VIEWPORT = { once: false, amount: 0.2 }
const DESPLAZAMIENTO = 24
const DURACION = 0.55
const DURACION_AL_OCULTAR = 0.25
const EASE = [0.22, 1, 0.36, 1]

// Tope del retraso en cadena: en una fila de 30 productos el último no
// tiene que esperar 2 segundos -- los que están fuera de pantalla ya
// quedan listos para cuando se scrollee la fila.
const RETRASO_POR_ITEM = 0.07
const ITEMS_CON_RETRASO = 7

const APARECER = {
  oculto: {
    opacity: 0,
    y: DESPLAZAMIENTO,
    transition: { duration: DURACION_AL_OCULTAR, ease: EASE },
  },
  visible: (indice = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: DURACION,
      ease: EASE,
      delay: Math.min(indice, ITEMS_CON_RETRASO) * RETRASO_POR_ITEM,
    },
  }),
}

export function RevelarProvider({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}

// Un bloque suelto (banner, imagen de categoría, texto). Lo observa un
// grupo que no se mueve: si mirara su propia visibilidad, al ocultarse
// bajaría 24px, volvería a contar como visible y parpadearía sin parar
// cuando la pantalla queda justo en el límite.
export function Revelar({ className, children }) {
  return (
    <RevelarGrupo>
      <m.div className={className} variants={APARECER}>
        {children}
      </m.div>
    </RevelarGrupo>
  )
}

// Grilla o fila: dispara a sus RevelarItem todos juntos cuando entra en
// pantalla. Un solo observer por grupo, y no uno por tarjeta: si cada una
// mirara su propia visibilidad, las de una fila horizontal se animarían
// recién al scrollearla, con la tarjeta todavía vacía.
// amount: fracción del grupo que tiene que verse. Una grilla más alta que
// varias pantallas pasa "some", porque el 20% de ella podría no entrar nunca.
export function RevelarGrupo({ className, children, ref, onScroll, amount = VIEWPORT.amount }) {
  return (
    <m.div
      ref={ref}
      className={className}
      onScroll={onScroll}
      initial="oculto"
      whileInView="visible"
      viewport={{ ...VIEWPORT, amount }}
    >
      {children}
    </m.div>
  )
}

// Celda de un RevelarGrupo. La animación va en esta celda y no en la tarjeta
// porque framer-motion escribe `transform` en línea, y eso anularía el
// :hover (translateY) del CSS de cada tarjeta.
export function RevelarItem({ indice, children }) {
  return (
    <m.div className="tienda-revelar-celda" variants={APARECER} custom={indice}>
      {children}
    </m.div>
  )
}
