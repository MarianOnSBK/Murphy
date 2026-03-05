import { contextBridge, ipcRenderer } from 'electron'
import type { ChatMessage, Conversation, WorkflowMetadata, MCPConfig } from '../src/types'

// API-Bridge: Stellt dem Renderer-Prozess sichere IPC-Methoden zur Verfügung
contextBridge.exposeInMainWorld('jarvis', {
  // Chat-Nachrichten senden und Verlauf laden
  sendMessage: (content: string, conversationId: string): Promise<ChatMessage> =>
    ipcRenderer.invoke('chat:send', content, conversationId),

  getHistory: (conversationId: string): Promise<ChatMessage[]> =>
    ipcRenderer.invoke('chat:history', conversationId),

  // Konversationsverwaltung
  listConversations: (): Promise<Conversation[]> =>
    ipcRenderer.invoke('conversation:list'),

  newConversation: (): Promise<Conversation> =>
    ipcRenderer.invoke('conversation:new'),

  // Workflow-Verwaltung
  listWorkflows: (): Promise<WorkflowMetadata[]> =>
    ipcRenderer.invoke('workflow:list'),

  // Einstellungen
  getSettings: (): Promise<MCPConfig> =>
    ipcRenderer.invoke('settings:get'),

  saveSettings: (config: MCPConfig): Promise<void> =>
    ipcRenderer.invoke('settings:save', config),

  // Ollama-Verbindungsstatus
  getOllamaStatus: (): Promise<{ connected: boolean; models: string[] }> =>
    ipcRenderer.invoke('ollama:status'),

  // Event-Listener: Einzelne Stream-Tokens empfangen (für Echtzeit-Anzeige)
  onStreamToken: (
    callback: (data: { token: string; conversationId: string }) => void
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { token: string; conversationId: string }) =>
      callback(data)
    ipcRenderer.on('chat:token', handler)
    // Gibt Cleanup-Funktion zurück
    return () => ipcRenderer.removeListener('chat:token', handler)
  },

  // Event-Listener: Status-Updates empfangen
  onStatusChange: (callback: (status: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status)
    ipcRenderer.on('status:change', handler)
    return () => ipcRenderer.removeListener('status:change', handler)
  }
})
