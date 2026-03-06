// Typdefinitionen für die window.jarvis API, die vom Preload-Skript bereitgestellt wird
import type { ChatMessage, Conversation, WorkflowMetadata, MCPConfig } from './types'

declare global {
  interface Window {
    jarvis: {
      // Chat
      sendMessage: (content: string, conversationId: string) => Promise<ChatMessage>
      getHistory: (conversationId: string) => Promise<ChatMessage[]>

      // Konversationsverwaltung
      listConversations: () => Promise<Conversation[]>
      newConversation: () => Promise<Conversation>

      // Workflows
      listWorkflows: () => Promise<WorkflowMetadata[]>

      // Einstellungen
      getSettings: () => Promise<MCPConfig>
      saveSettings: (config: MCPConfig) => Promise<void>

      // Ollama-Status
      getOllamaStatus: () => Promise<{ connected: boolean; models: string[] }>

      // Echtzeit-Events (geben Cleanup-Funktion zurück)
      onStreamToken: (
        callback: (data: { token: string; conversationId: string }) => void
      ) => () => void
      onStatusChange: (callback: (status: string) => void) => () => void

      // Browser-Screenshots aus dem Live-Browser-View (Meilenstein 2)
      onBrowserScreenshot: (
        callback: (data: { screenshotBase64: string; conversationId: string }) => void
      ) => () => void
    }
  }
}
