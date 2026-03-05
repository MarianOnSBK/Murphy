import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageBubble } from './MessageBubble'
import type { ChatMessage } from '../types'

interface ChatWindowProps {
  conversationId: string
  onMessageSent?: () => void
}

export function ChatWindow({ conversationId, onMessageSent }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [streamingContent, setStreamingContent] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Konversationsverlauf neu laden wenn sich die Konversation ändert
  useEffect(() => {
    const loadHistory = async () => {
      const history = await window.jarvis.getHistory(conversationId)
      setMessages(history)
      setStreamingContent('')
    }
    loadHistory()
  }, [conversationId])

  // Stream-Tokens empfangen und live anzeigen
  useEffect(() => {
    const cleanup = window.jarvis.onStreamToken(({ token, conversationId: cid }) => {
      if (cid === conversationId) {
        setStreamingContent((prev) => prev + token)
      }
    })
    return cleanup
  }, [conversationId])

  // Nach jeder Nachricht automatisch nach unten scrollen
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const sendMessage = useCallback(async () => {
    const content = input.trim()
    if (!content || isLoading) return

    setInput('')
    setIsLoading(true)
    setStreamingContent('')

    // Nutzernachricht sofort optimistisch anzeigen
    const tempId = `temp-${Date.now()}`
    const tempMsg: ChatMessage = {
      id: tempId,
      role: 'user',
      content,
      timestamp: Date.now()
    }
    setMessages((prev) => [...prev, tempMsg])

    try {
      await window.jarvis.sendMessage(content, conversationId)
      // Nach Abschluss den echten Verlauf laden (korrigierte IDs und Timestamps)
      const history = await window.jarvis.getHistory(conversationId)
      setMessages(history)
      onMessageSent?.()
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Fehler: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev.filter((m) => m.id !== tempId), errorMsg])
    } finally {
      setIsLoading(false)
      setStreamingContent('')
      inputRef.current?.focus()
    }
  }, [input, isLoading, conversationId, onMessageSent])

  // Enter = Senden, Shift+Enter = Zeilenumbruch im Eingabefeld
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage]
  )

  return (
    <div className="chat-window">
      {/* Nachrichtenliste */}
      <div className="messages-list">
        {messages.length === 0 && !isLoading && (
          <div className="empty-state">
            <div className="empty-icon">🤖</div>
            <p>Hallo! Ich bin Jarvis, dein persönlicher KI-Assistent.</p>
            <p>Wie kann ich dir heute helfen?</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming-Antwort: Ladeanimation oder live Text anzeigen */}
        {isLoading && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              timestamp: Date.now()
            }}
            isStreaming={streamingContent === ''}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Eingabebereich */}
      <div className="input-area">
        <textarea
          ref={inputRef}
          className="message-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nachricht eingeben… (Enter zum Senden, Shift+Enter für Zeilenumbruch)"
          disabled={isLoading}
          rows={3}
          autoFocus
        />
        <button
          className={`send-btn ${isLoading ? 'loading' : ''}`}
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          title="Senden (Enter)"
          aria-label="Nachricht senden"
        >
          {isLoading ? (
            <span className="spinner" />
          ) : (
            <span>➤</span>
          )}
        </button>
      </div>
    </div>
  )
}
