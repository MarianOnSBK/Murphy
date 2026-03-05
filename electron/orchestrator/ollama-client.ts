import type { ChatMessage } from '../../src/types'

// Ollama API-interne Typen
interface OllamaMessage {
  role: string
  content: string
}

export interface OllamaTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface OllamaToolCall {
  function: {
    name: string
    arguments: Record<string, unknown>
  }
}

interface OllamaStreamChunk {
  message?: {
    content?: string
    tool_calls?: OllamaToolCall[]
  }
  done: boolean
}

interface OllamaTagsResponse {
  models: Array<{ name: string }>
}

export class OllamaClient {
  private readonly baseUrl: string
  private readonly model: string

  constructor(
    baseUrl = 'http://localhost:11434',
    model = 'qwen2.5:7b-instruct'
  ) {
    this.baseUrl = baseUrl
    this.model = model
  }

  /**
   * Sendet eine Chat-Anfrage an Ollama und streamt die Antwort token-weise.
   * @param history - Bisherige Konversationsnachrichten als Kontext
   * @param tools - Verfügbare MCP-Tools (leer in Meilenstein 1)
   * @param onToken - Callback für jeden empfangenen Text-Token
   * @param onToolCalls - Callback wenn das Modell Tool-Calls zurückgibt
   */
  async streamChat(
    history: ChatMessage[],
    tools: OllamaTool[],
    onToken: (token: string) => void,
    onToolCalls: (toolCalls: OllamaToolCall[]) => Promise<void>
  ): Promise<void> {
    // Nachrichten-Verlauf ins Ollama-Format konvertieren
    const messages: OllamaMessage[] = history.map((msg) => ({
      role: msg.role,
      content: msg.content
    }))

    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true
    }

    // Tools nur mitsenden wenn vorhanden (sonst ignoriert Ollama das Feld)
    if (tools.length > 0) {
      requestBody.tools = tools
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      throw new Error(
        `Ollama-Fehler ${response.status}: ${response.statusText}. ` +
        `Ist Ollama gestartet und das Modell "${this.model}" geladen?`
      )
    }

    if (!response.body) {
      throw new Error('Ollama hat keinen Response-Body zurückgegeben')
    }

    // Antwort zeilenweise streamen und parsen
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Letzte (ggf. unvollständige) Zeile im Buffer behalten
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const chunk = JSON.parse(line) as OllamaStreamChunk

          // Text-Token weiterleiten
          if (chunk.message?.content) {
            onToken(chunk.message.content)
          }

          // Tool-Calls verarbeiten (Meilenstein 2)
          if (chunk.message?.tool_calls && chunk.message.tool_calls.length > 0) {
            await onToolCalls(chunk.message.tool_calls)
          }
        } catch {
          // Ungültige JSON-Zeile überspringen (kann bei Ollama vorkommen)
        }
      }
    }
  }

  /**
   * Prüft ob Ollama erreichbar ist und gibt verfügbare Modelle zurück.
   */
  async getStatus(): Promise<{ connected: boolean; models: string[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) {
        return { connected: false, models: [] }
      }

      const data = (await response.json()) as OllamaTagsResponse
      const models = data.models?.map((m) => m.name) ?? []
      return { connected: true, models }
    } catch {
      return { connected: false, models: [] }
    }
  }
}
