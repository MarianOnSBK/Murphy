import { useState, useEffect, useCallback } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { WorkflowViewer } from './components/WorkflowViewer'
import { StatusBar } from './components/StatusBar'
import { SettingsPanel } from './components/SettingsPanel'
import { LiveBrowserView } from './components/LiveBrowserView'
import type { Conversation, WorkflowMetadata } from './types'

type ActiveView = 'chat' | 'workflows' | 'settings'

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('chat')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [workflows, setWorkflows] = useState<WorkflowMetadata[]>([])
  const [status, setStatus] = useState<string>('Starte…')
  const [ollamaConnected, setOllamaConnected] = useState<boolean>(false)

  // Live-Browser-Ansicht (Meilenstein 2)
  const [browserScreenshot, setBrowserScreenshot] = useState<string | undefined>(undefined)
  const [isBrowserActive, setIsBrowserActive] = useState<boolean>(false)

  // Status-Updates vom Hauptprozess empfangen
  useEffect(() => {
    if (!window.jarvis) return
    const cleanup = window.jarvis.onStatusChange((newStatus) => {
      setStatus(newStatus)
      // Browser-Ansicht aktivieren wenn Assistent im Browser arbeitet
      const browserActive =
        newStatus.includes('Ruft browser') ||
        newStatus.includes('Führt aus') ||
        newStatus.includes('browser_run_task')
      setIsBrowserActive(browserActive)
    })
    return cleanup
  }, [])

  // Browser-Screenshots empfangen (Meilenstein 2)
  useEffect(() => {
    if (!window.jarvis) return
    const cleanup = window.jarvis.onBrowserScreenshot(({ screenshotBase64, conversationId }) => {
      // Screenshot nur anzeigen wenn es die aktive Konversation ist
      if (conversationId === activeConversationId) {
        setBrowserScreenshot(screenshotBase64)
        setIsBrowserActive(true)
      }
    })
    return cleanup
  }, [activeConversationId])

  // Initialisierung: Ollama-Status prüfen, Konversationen laden
  useEffect(() => {
    if (!window.jarvis) {
      setStatus('Fehler: Preload nicht geladen — App neu starten')
      return
    }
    const init = async () => {
      const ollamaStatus = await window.jarvis.getOllamaStatus()
      setOllamaConnected(ollamaStatus.connected)

      const convList = await window.jarvis.listConversations()
      setConversations(convList)

      if (convList.length > 0) {
        setActiveConversationId(convList[0].id)
      } else {
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
    // Browser-Ansicht beim Wechsel zurücksetzen
    setBrowserScreenshot(undefined)
    setIsBrowserActive(false)
  }, [])

  const handleViewChange = useCallback(async (view: ActiveView) => {
    setActiveView(view)
    if (view === 'workflows') {
      const wf = await window.jarvis.listWorkflows()
      setWorkflows(wf)
    }
  }, [])

  const handleConversationUpdated = useCallback(async () => {
    const convList = await window.jarvis.listConversations()
    setConversations(convList)
  }, [])

  const handleConversationSelect = useCallback((id: string) => {
    setActiveConversationId(id)
    // Browser-Ansicht beim Konversationswechsel zurücksetzen
    setBrowserScreenshot(undefined)
    setIsBrowserActive(false)
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

        {/* Konversationsliste (nur im Chat-Modus) */}
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
                  onClick={() => handleConversationSelect(conv.id)}
                  title={conv.title}
                >
                  {conv.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Hauptbereich — aufgeteilt wenn Browser-Ansicht aktiv */}
      <main className={`main-content ${isBrowserActive ? 'with-browser' : ''}`}>
        {activeView === 'chat' && activeConversationId && (
          <>
            <ChatWindow
              conversationId={activeConversationId}
              onMessageSent={handleConversationUpdated}
            />

            {/* Live-Browser-Ansicht: erscheint rechts wenn Assistent im Browser arbeitet */}
            <LiveBrowserView
              screenshotBase64={browserScreenshot}
              isActive={isBrowserActive}
              onClose={() => {
                setIsBrowserActive(false)
                setBrowserScreenshot(undefined)
              }}
            />
          </>
        )}
        {activeView === 'workflows' && <WorkflowViewer workflows={workflows} />}
        {activeView === 'settings' && <SettingsPanel />}
      </main>

      {/* Statusleiste */}
      <StatusBar status={status} ollamaConnected={ollamaConnected} />
    </div>
  )
}
