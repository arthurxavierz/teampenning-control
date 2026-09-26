import React from 'react'
import { actions } from '../lib/store'

// Se uma tela quebrar, a pessoa vê o que houve e tem saída, em vez de uma
// página em branco no meio da prova.
export default class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash">
        <span className="gallop is-still" aria-hidden="true" />
        <h1>Algo saiu da pista.</h1>
        <p>Esta tela encontrou um erro. Os dados já lançados continuam salvos neste navegador.</p>
        <code>{String(this.state.error?.message || this.state.error)}</code>
        <div className="row-start">
          <button className="btn btn-gold" onClick={() => location.reload()}>Recarregar</button>
          <button className="btn btn-outline-light" onClick={() => location.assign('/admin')}>Ir para a organização</button>
          <button className="btn btn-outline-light" onClick={() => { if (confirm('Apagar os dados deste navegador e voltar à demonstração?')) { actions.reset(); location.assign('/') } }}>Restaurar demonstração</button>
        </div>
      </div>
    )
  }
}
