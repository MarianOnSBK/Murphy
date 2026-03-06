import type { ChatMessage } from '../../src/types'

// ─── Ollama API-Typen ─────────────────────────────────────────────────────────

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  tool_calls?: OllamaToolCall[]
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
    // Ollama liefert arguments manchmal als JSON-String, manchmal als Objekt
    arguments: Record<string, unknown> | string
  }
}

export interface OllamaChatResponse {
  model: string
  message: {
    role: string
    content: string
    tool_calls?: OllamaToolCall[]
  }
  done: boolean
  done_reason?: string
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

// ─── OllamaClient ─────────────────────────────────────────────────────────────

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
   * Nicht-streamende Chat-Anfrage — für den Tool-Call-Loop.
   * Wartet auf die vollständige Antwort bevor sie zurückgegeben wird.
   */
  async chat(messages: OllamaMessage[], tools: OllamaTool[]): Promise<OllamaChatResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false
    }

    if (tools.length > 0) {
      body.tools = tools
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error(
        `Ollama-Fehler ${response.status}: ${response.statusText}. ` +
          `Ist Ollama gestartet und Modell "${this.model}" geladen?`
      )
    }

    return response.json() as Promise<OllamaChatResponse>
  }

  /**
   * Streamende Chat-Anfrage — für direkte Textantworten ohne Tool-Calls.
   * Ruft onToken für jeden Token auf (Echtzeit-Anzeige im Frontend).
   */
  async streamChat(
    messages: OllamaMessage[],
    tools: OllamaTool[],
    onToken: (token: string) => void,
    onToolCalls: (toolCalls: OllamaToolCall[]) => Promise<void>
  ): Promise<void> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true
    }

    if (tools.length > 0) {
      body.tools = tools
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error(
        `Ollama-Fehler ${response.status}: ${response.statusText}. ` +
          `Ist Ollama gestartet und Modell "${this.model}" geladen?`
      )
    }

    if (!response.body) {
      throw new Error('Ollama hat keinen Response-Body zurückgegeben')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const chunk = JSON.parse(line) as OllamaStreamChunk

          if (chunk.message?.content) {
            onToken(chunk.message.content)
          }

          if (chunk.message?.tool_calls && chunk.message.tool_calls.length > 0) {
            await onToolCalls(chunk.message.tool_calls)
          }
        } catch {
          // Ungültige JSON-Zeile überspringen
        }
      }
    }
  }

  /**
   * Konvertiert ChatMessage-Verlauf ins Ollama-Format.
   */
  static toOllamaMessages(history: ChatMessage[]): OllamaMessage[] {
    return history.map((msg) => ({
      role: msg.role,
      content: msg.content
    }))
  }

  /**
   * Normalisiert OllamaToolCall-Argumente zu einem echten Objekt.
   * Ollama liefert arguments manchmal als JSON-String.
   */
  static normalizeArgs(toolCall: OllamaToolCall): Record<string, unknown> {
    const raw = toolCall.function.arguments
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as Record<string, unknown>
      } catch {
        return { _raw: raw }
      }
    }
    return raw
  }

  /**
   * Prüft ob Ollama erreichbar ist und gibt verfügbare Modelle zurück.
   */
  async getStatus(): Promise<{ connected: boolean; models: string[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) return { connected: false, models: [] }

      const data = (await response.json()) as OllamaTagsResponse
      const models = data.models?.map((m) => m.name) ?? []
      return { connected: true, models }
    } catch {
      return { connected: false, models: [] }
    }
  }
}
