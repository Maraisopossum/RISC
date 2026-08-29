import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Sans ceci, une erreur JS non interceptée n'importe où dans l'appli fait
// disparaître toute la page (React démonte l'arbre) sans aucun message —
// c'est exactement ce qui s'est produit avec un plantage du scanner caméra.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur non interceptée :', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-xl font-semibold text-slate-900">Une erreur est survenue</h1>
            <p className="text-slate-500">
              L'application a rencontré un problème inattendu. Rechargez la page pour continuer.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-slate-900 text-white px-4 py-2 font-medium hover:bg-slate-800"
            >
              Recharger la page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
