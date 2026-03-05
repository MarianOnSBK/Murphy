import { useState, useEffect, useCallback } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { WorkflowViewer } from './components/WorkflowViewer'
import { StatusBar } from './components/StatusBar'
import { SettingsPanel } from './components/SettingsPanel'
import type { Conversation, WorkflowMetadata } from './types'

type ActiveView = 'chat' | 'workflows' | 'settings'

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('chat')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [workflows, setWorkflows] = useState<WorkflowMetadata[]>([])
  const [status, setStatus] = useState<string>('Starte…')
  const [ollamaConnected, setOllamaConnected] = useState<boolean>(false)

  // Status-Updates vom Hauptprozess empfangen
  useEffect(() => {
    const cleanup = window.jarvis.onStatusChange(setStatus)
    return cleanup
  }, [])

  // Initialisierung: Ollama-Status prüfen, Konversationen laden
  useEffect(() => {
    const init = async () => {
      const ollamaStatus = await window.jarvis.getOllamaStatus()
      setOllamaConnected(ollamaStatus.connected)

      const convList = await window.jarvis.listConversations()
      setConversations(convList)

      if (convList.length > 0) {
        setActiveConversationId(convList[0].id)
      } else {
        // Erste Konversation automatisch anlegen
        const newConv = await window.jarvis.newConversation()
        setConversations([newConv])
        setActiveConversationId(newConv.id)
      }
    }

    init()
  }, [])

  const handleNewConversation = useCallback(async () => {
    const newConv = await window.jarvis.newConversation()
    setConversations((prev) => [newConv, ...prev])
    setActiveConversationId(newConv.id)
    setActiveView('chat')
  }, [])

  const handleViewChange = useCallback(async (view: ActiveView) => {
    setActiveView(view)
    // Workflows bei Wechsel zur Workflow-Ansicht neu laden
    if (view === 'workflows') {
      const wf = await window.jarvis.listWorkflows()
      setWorkflows(wf)
    }
  }, [])

  // Konversationsliste nach gesendeter Nachricht aktualisieren (Titelaktualisierung)
  const handleConversationUpdated = useCallback(async () => {
    const convList = await window.jarvis.listConversations()
    setConversations(convList)
  }, [])

  return (
    <div className="app-layout">
      {/* Seitenleiste */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo-text">JARVIS</span>
          <span
            className={`status-dot ${ollamaConnected ? 'connected' : 'disconnected'}`}
            title={ollamaConnected ? 'Ollama verbunden' : 'Ollama nicht erreichbar'}
          />
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeView === 'chat' ? 'active' : ''}`}
            onClick={() => handleViewChange('chat')}
          >
            <span className="nav-icon">💬</span>
            <span>Chat</span>
          </button>
          <button
            className={`nav-item ${activeView === 'workflows' ? 'active' : ''}`}
            onClick={() => handleViewChange('workflows')}
          >
            <span className="nav-icon">⚡</span>
            <span>Workflows</span>
          </button>
          <button
            className={`nav-item ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => handleViewChange('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span>Einstellungen</span>
          </button>
        </nav>

        {/* Konversationsliste (nur im Chat-Modus sichtbar) */}
        {activeView === 'chat' && (
          <div className="conversation-list">
            <button className="new-conv-btn" onClick={handleNewConversation}>
              + Neue Konversation
            </button>
            <div className="conv-items">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  className={`conv-item ${conv.id === activeConversationId ? 'active' : ''}`}
                  onClick={() => setActiveConversationId(conv.id)}
                  title={conv.title}
                >
                  {conv.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Hauptbereich */}
      <main className="main-content">
        {activeView === 'chat' && activeConversationId && (
          <ChatWindow
            conversationId={activeConversationId}
            onMessageSent={handleConversationUpdated}
          />
        )}
        {activeView === 'workflows' && <WorkflowViewer workflows={workflows} />}
        {activeView === 'settings' && <SettingsPanel />}
      </main>

      {/* Statusleiste unten */}
      <StatusBar status={status} ollamaConnected={ollamaConnected} />
    </div>
  )
}
