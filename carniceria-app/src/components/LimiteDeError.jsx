import { Component } from 'react'

// Error boundary: si algo dentro de este bloque tira un error al
// renderizar, se muestra un aviso en su lugar en vez de dejar TODA la
// pantalla en blanco (React desmonta el árbol entero ante un error no
// atrapado). Tiene que ser un componente de clase: React no ofrece
// todavía una versión con hooks.
//
// Uso: <LimiteDeError nombre="el modal de mermas">...</LimiteDeError>
export class LimiteDeError extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Queda en la consola del navegador (F12) con el componente exacto.
    console.error(`[LimiteDeError] Falló ${this.props.nombre ?? 'un componente'}:`, error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="staff-card" role="alert">
        <p className="staff-mensaje-error" style={{ margin: 0 }}>
          No se pudo mostrar {this.props.nombre ?? 'esta sección'}: {String(this.state.error?.message ?? this.state.error)}
        </p>
        <button
          type="button"
          className="staff-btn staff-btn-secundario"
          style={{ marginTop: '0.6rem' }}
          onClick={() => this.setState({ error: null })}
        >
          Reintentar
        </button>
      </div>
    )
  }
}
