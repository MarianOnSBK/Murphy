/**
 * Orchestrator — Meilenstein 2
 *
 * Zentrale Steuerungseinheit:
 * - Nimmt Chat-Nachrichten entgegen
 * - Führt den Tool-Call-Loop (Ollama ↔ MCP-Server) durch
 * - Leitet Screenshots aus Tool-Ergebnissen an den Renderer weiter
 * - Speichert Konversationsverläufe in SQLite
 */

import { randomUUID } from 'crypto'
import { OllamaClient, type OllamaMessage, type OllamaTool, type OllamaToolCall } from './ollama-client'
import { ConversationStore } from './conversation-store'
import { WorkflowStore } from './workflow-store'
import { MCPManager } from './mcp-manager'
import type { ChatMessage, Conversation, WorkflowMetadata, MCPConfig } from '../../src/types'

// Maximale Anzahl Tool-Call-Iterationen pro Anfrage (Endlosschleifen verhindern)
const MAX_TOOL_ITERATIONS = 15

export class Orchestrator {
  private ollamaClient: OllamaClient
  private conversationStore: ConversationStore
  private workflowStore: WorkflowStore
  private mcpManager: MCPManager

  constructor(
    private readonly onStatusUpdate: (status: string) => void,
    private readonly onStreamToken: (token: string, conversationId: string) => void,
    private readonly onBrowserScreenshot: (screenshotBase64: string, conversationId: string) => void
  ) {
    this.ollamaClient = new OllamaClient()
    this.conversationStore = new ConversationStore()
    this.workflowStore = new WorkflowStore()
    this.mcpManager = new MCPManager()
  }

  async initialize(): Promise<void> {
    this.onStatusUpdate('Starte…')

    this.conversationStore.initialize()
    this.workflowStore.initialize()
    await this.mcpManager.initialize()

    this.onStatusUpdate('Bereit')
  }

  /**
   * Verarbeitet eine Nutzernachricht:
   * 1. Nutzernachricht in SQLite speichern
   * 2. Wenn MCP-Tools verfügbar: Tool-Call-Loop starten
   *    Wenn keine Tools: direkt streamen
   * 3. Fertige Antwort speichern und zurückgeben
   */
  async sendMessage(content: string, conversationId: string): Promise<ChatMessage> {
    this.onStatusUpdate('Denkt…')

    // Nutzernachricht persistieren
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    }
    this.conversationStore.saveMessage(conversationId, userMessage)

    // Vollständigen Verlauf als Kontext laden
    const history = this.conversationStore.getMessages(conversationId)
    const ollamaMessages = OllamaClient.toOllamaMessages(history)

    // Verfügbare MCP-Tools ermitteln
    const tools = await this.mcpManager.getAvailableTools()

    let finalResponse = ''

    try {
      if (tools.length === 0) {
        // ── Kein Tool verfügbar → direkt streamen (M1-Verhalten) ──────────
        await this.ollamaClient.streamChat(
          ollamaMessages,
          [],
          (token) => {
            finalResponse += token
            this.onStreamToken(token, conversationId)
          },
          async () => { /* keine Tools → kein Tool-Call-Handler nötig */ }
        )
      } else {
        // ── Tool-Call-Loop ─────────────────────────────────────────────────
        finalResponse = await this.runToolCallLoop(
          ollamaMessages,
          tools,
          conversationId
        )
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      finalResponse = `Fehler bei der Kommunikation mit Ollama: ${msg}`
      console.error('[Orchestrator] sendMessage-Fehler:', error)
    }

    // Assistenten-Antwort speichern
    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: finalResponse,
      timestamp: Date.now()
    }
    this.conversationStore.saveMessage(conversationId, assistantMessage)

    // Konversationstitel aus der ersten Nutzernachricht ableiten
    if (history.filter((m) => m.role === 'user').length === 1) {
      const title = content.length > 60 ? content.substring(0, 60) + '…' : content
      this.conversationStore.updateConversationTitle(conversationId, title)
    }

    this.onStatusUpdate('Bereit')
    return assistantMessage
  }

  /**
   * Tool-Call-Loop:
   * Sendet Nachrichten an Ollama und verarbeitet Tool-Calls solange, bis
   * Ollama eine reine Textantwort zurückgibt (kein tool_call mehr im response).
   *
   * Nachrichtenstruktur im Loop:
   *   user: "Aufgabe"
   *   → assistant: tool_call(browser_run_task)
   *   → tool: "Ergebnis..."
   *   → assistant: "Hier ist das Ergebnis..."  ← Finale Antwort
   */
  private async runToolCallLoop(
    initialMessages: OllamaMessage[],
    tools: OllamaTool[],
    conversationId: string
  ): Promise<string> {
    let messages = [...initialMessages]
    let iterations = 0

    while (iterations++ < MAX_TOOL_ITERATIONS) {
      this.onStatusUpdate('Denkt…')

      const response = await this.ollamaClient.chat(messages, tools)
      const assistantMsg = response.message

      // Kein Tool-Call → Finale Textantwort
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        const text = assistantMsg.content ?? ''

        // Als Token senden damit das Frontend ihn anzeigt
        if (text) {
          this.onStreamToken(text, conversationId)
        }

        return text
      }

      // Tool-Call-Nachricht in den Verlauf aufnehmen
      messages.push({
        role: 'assistant',
        content: assistantMsg.content ?? '',
        tool_calls: assistantMsg.tool_calls
      })

      // Alle Tool-Calls nacheinander ausführen
      for (const toolCall of assistantMsg.tool_calls) {
        const toolName = toolCall.function.name
        const toolArgs = OllamaClient.normalizeArgs(toolCall)

        this.onStatusUpdate(`Ruft ${toolName} auf…`)
        console.log(`[Orchestrator] Tool-Call: ${toolName}`, toolArgs)

        try {
          const result = await this.mcpManager.callTool(toolName, toolArgs as OllamaToolCall['function']['arguments'])

          // Screenshots extrahieren und an Renderer senden
          const screenshots = MCPManager.extractScreenshots(result)
          for (const screenshot of screenshots) {
            this.onBrowserScreenshot(screenshot, conversationId)
          }

          // Text-Ergebnis für Ollama aufbereiten
          const textContent = MCPManager.extractText(result)
          const toolResultText = textContent || '(Tool ausgeführt, kein Textergebnis)'

          // Tool-Ergebnis in den Verlauf aufnehmen
          messages.push({
            role: 'tool',
            content: toolResultText
          })

          this.onStatusUpdate(`${toolName} abgeschlossen`)
          console.log(`[Orchestrator] ${toolName} Ergebnis: ${toolResultText.substring(0, 100)}...`)

        } catch (err) {
          const errText = `Tool '${toolName}' fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
          console.error(`[Orchestrator] ${errText}`)

          // Fehler als Tool-Ergebnis zurückgeben, damit Ollama nachfragen kann
          messages.push({
            role: 'tool',
            content: errText
          })

          this.onStatusUpdate('Fehler — Assistent fragt nach…')
        }
      }
    }

    // Maximale Iterationen erreicht
    const limitMsg = `Maximale Anzahl Tool-Aufrufe (${MAX_TOOL_ITERATIONS}) erreicht. Aufgabe möglicherweise unvollständig.`
    this.onStreamToken(limitMsg, conversationId)
    return limitMsg
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
