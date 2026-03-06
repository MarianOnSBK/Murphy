import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Unbehandelter Fehler:', error)
    console.error('[ErrorBoundary] Komponenten-Stack:', info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (error) {
      return (
        <div style={{
          padding: '40px 32px',
          color: '#fc8181',
          fontFamily: 'monospace',
          background: '#0d0d1a',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <h1 style={{ color: '#f6ad55', fontSize: '18px' }}>Jarvis — Startfehler</h1>
          <p style={{ color: '#e8eaf6' }}>{error.message}</p>
          <pre style={{
            background: '#1a1a35',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '12px',
            overflow: 'auto',
            color: '#8892b0',
            border: '1px solid #2a2a50'
          }}>
            {error.stack}
          </pre>
          <p style={{ color: '#8892b0', fontSize: '13px' }}>
            Tipp: Ist Ollama gestartet? Wurde <code>npm install</code> ausgeführt?
          </p>
        </div>
      )
    }

    return this.props.children
  }
}
