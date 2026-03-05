interface StatusBarProps {
  status: string
  ollamaConnected: boolean
}

export function StatusBar({ status, ollamaConnected }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span className="status-text">{status}</span>
      <span className={`connection-status ${ollamaConnected ? 'ok' : 'error'}`}>
        <span className="dot" />
        {ollamaConnected ? 'Ollama verbunden' : 'Ollama nicht erreichbar'}
      </span>
    </footer>
  )
}
