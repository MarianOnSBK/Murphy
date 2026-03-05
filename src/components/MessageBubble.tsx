import type { ChatMessage } from '../types'

interface MessageBubbleProps {
  message: ChatMessage
  /** Wenn true, zeigt eine Ladeanimation statt des Inhalts an */
  isStreaming?: boolean
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
      {/* Kopfzeile: Rolle + Zeitstempel */}
      <div className="bubble-header">
        <span className="bubble-role">{isUser ? 'Du' : 'Jarvis'}</span>
        {!isStreaming && (
          <span className="bubble-time">{formatTime(message.timestamp)}</span>
        )}
      </div>

      {/* Nachrichteninhalt */}
      <div className="bubble-body">
        {isStreaming && message.content === '' ? (
          // Ladeanimation wenn noch kein Text angekommen ist
          <div className="typing-indicator">
            <span />
            <span />
            <span />
          </div>
        ) : (
          // Text als Preformatted (behält Zeilenumbrüche aus dem Modell)
          <pre className="bubble-text">{message.content}</pre>
        )}
      </div>
    </div>
  )
}
