import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { LogoMark } from './Logo'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  failed: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('Falha inesperada na interface', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="app-shell flex min-h-dvh items-center justify-center p-5">
        <section className="recovery-card" role="alert">
          <LogoMark className="!h-11 !w-11" />
          <span className="micro-label">SINAL FORA DO AR</span>
          <h1>A interface encontrou um problema.</h1>
          <p>Recarregue a Lunatica para retomar. Suas conversas salvas continuam protegidas.</p>
          <div><button type="button" className="btn-primary" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" /> Recarregar</button></div>
        </section>
      </div>
    )
  }
}
