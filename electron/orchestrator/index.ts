import { randomUUID } from 'crypto'
import { OllamaClient } from './ollama-client'
import { ConversationStore } from './conversation-store'
import { WorkflowStore } from './workflow-store'
import { MCPManager } from './mcp-manager'
import type { ChatMessage, Conversation, WorkflowMetadata, MCPConfig } from '../../src/types'

export class Orchestrator {
  private ollamaClient: OllamaClient
  private conversationStore: ConversationStore
  private workflowStore: WorkflowStore
  private mcpManager: MCPManager

  constructor(
    // Callback-Funktionen für Kommunikation mit dem Renderer (kein direkter Import von main.ts)
    private readonly onStatusUpdate: (status: string) => void,
    private readonly onStreamToken: (token: string, conversationId: string) => void
  ) {
    this.ollamaClient = new OllamaClient()
    this.conversationStore = new ConversationStore()
    this.workflowStore = new WorkflowStore()
    this.mcpManager = new MCPManager()
  }

  async initialize(): Promise<void> {
    this.onStatusUpdate('Starte...')

    // Datenbankverbindungen aufbauen
    this.conversationStore.initialize()
    this.workflowStore.initialize()

    // MCP-Manager initialisieren (startet aktivierte Server in M2)
    await this.mcpManager.initialize()

    this.onStatusUpdate('Bereit')
  }

  /**
   * Verarbeitet eine neue Nutzernachricht:
   * 1. In SQLite speichern
   * 2. An Ollama senden (mit vollständigem Kontext)
   * 3. Antwort streamen
   * 4. Fertige Antwort speichern
   */
  async sendMessage(content: string, conversationId: string): Promise<ChatMessage> {
    this.onStatusUpdate('Denkt...')

    // Nutzernachricht speichern
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    }
    this.conversationStore.saveMessage(conversationId, userMessage)

    // Bisherigen Verlauf als Kontext laden
    const history = this.conversationStore.getMessages(conversationId)

    // Verfügbare MCP-Tools ermitteln (M1: leer)
    const tools = await this.mcpManager.getAvailableTools()

    let fullResponse = ''

    try {
      await this.ollamaClient.streamChat(
        history,
        tools,
        (token) => {
          fullResponse += token
          this.onStreamToken(token, conversationId)
        },
        async (toolCalls) => {
          // Tool-Calls an MCP-Server weiterleiten (M2)
          this.onStatusUpdate('Führt aus...')
          for (const toolCall of toolCalls) {
            await this.mcpManager.callTool(
              toolCall.function.name,
              toolCall.function.arguments
            )
          }
          this.onStatusUpdate('Denkt...')
        }
      )
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      fullResponse = `Fehler bei der Kommunikation mit Ollama: ${msg}`
    }

    // Assistenten-Antwort speichern
    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: fullResponse,
      timestamp: Date.now()
    }
    this.conversationStore.saveMessage(conversationId, assistantMessage)

    // Konversationstitel aus erster Nutzernachricht ableiten
    if (history.filter((m) => m.role === 'user').length === 1) {
      const title = content.length > 60 ? content.substring(0, 60) + '…' : content
      this.conversationStore.updateConversationTitle(conversationId, title)
    }

    this.onStatusUpdate('Bereit')
    return assistantMessage
  }

  getHistory(conversationId: string): ChatMessage[] {
    return this.conversationStore.getMessages(conversationId)
  }

  listConversations(): Conversation[] {
    return this.conversationStore.listConversations()
  }

  createConversation(): Conversation {
    return this.conversationStore.createConversation()
  }

  listWorkflows(): WorkflowMetadata[] {
    return this.workflowStore.listWorkflows()
  }

  getMcpConfig(): MCPConfig {
    return this.mcpManager.getConfig()
  }

  async saveMcpConfig(config: MCPConfig): Promise<void> {
    return this.mcpManager.saveConfig(config)
  }

  async getOllamaStatus(): Promise<{ connected: boolean; models: string[] }> {
    return this.ollamaClient.getStatus()
  }

  shutdown(): void {
    this.conversationStore.close()
    this.workflowStore.close()
    this.mcpManager.shutdown()
  }
}
