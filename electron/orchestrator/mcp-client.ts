/**
 * MCP-Client — Meilenstein 2
 *
 * Implementiert das Model Context Protocol (MCP) über stdio (JSON-RPC 2.0).
 * Startet einen MCP-Server als Kindprozess und kommuniziert über stdin/stdout.
 * Kein externes SDK notwendig — direkte Protokoll-Implementierung.
 */

import { spawn, ChildProcess } from 'child_process'

// ─── JSON-RPC 2.0 Typen ───────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  // Keine id — Notifications erwarten keine Antwort
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

// ─── MCP-Protokoll-Typen ──────────────────────────────────────────────────────

export interface MCPToolDefinition {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface MCPContentItem {
  type: 'text' | 'image' | 'resource'
  text?: string       // für type="text"
  data?: string       // für type="image" (base64)
  mimeType?: string   // für type="image"
}

export interface MCPToolResult {
  content: MCPContentItem[]
  isError?: boolean
}

// ─── MCP-Client-Klasse ────────────────────────────────────────────────────────

export class MCPClient {
  private proc: ChildProcess | null = null
  private buffer = ''
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  private nextId = 1
  public isReady = false
  public serverName = ''

  /**
   * Startet den MCP-Server-Prozess und führt den MCP-Handshake durch.
   */
  async start(
    command: string,
    args: string[],
    env?: Record<string, string>,
    cwd?: string
  ): Promise<void> {
    this.proc = spawn(command, args, {
      env: { ...process.env, ...(env ?? {}) },
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Windows: Shell-Modus für npx/python-Befehle
      shell: process.platform === 'win32'
    })

    // stdout: JSON-RPC-Antworten lesen
    this.proc.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8')
      this.flushBuffer()
    })

    // stderr: Logs des Serverprozesses weiterleiten
    this.proc.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf-8').trim()
      if (line) console.log(`[MCP/${this.serverName}] ${line}`)
    })

    this.proc.on('error', (err: Error) => {
      console.error(`[MCP/${this.serverName}] Prozessfehler:`, err.message)
      this.rejectAllPending(err)
    })

    this.proc.on('exit', (code, signal) => {
      console.log(`[MCP/${this.serverName}] Prozess beendet (code=${code}, signal=${signal})`)
      this.isReady = false
      this.rejectAllPending(new Error(`MCP-Prozess beendet (Code ${code})`))
    })

    // MCP-Handshake: initialize request/response
    const initResult = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'jarvis', version: '0.1.0' }
    }) as { serverInfo?: { name?: string }; protocolVersion?: string }

    this.serverName = initResult?.serverInfo?.name ?? this.serverName

    // initialized notification (keine Antwort erwartet)
    this.sendNotification('notifications/initialized')

    this.isReady = true
    console.log(`[MCP/${this.serverName}] Verbunden (Protokoll: ${initResult?.protocolVersion})`)
  }

  /**
   * Verarbeitet den Puffer zeilenweise und dispatcht JSON-RPC-Antworten.
   */
  private flushBuffer(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse

        // Nur Nachrichten mit ID sind Antworten auf Requests
        if (typeof msg.id === 'number') {
          const cb = this.pending.get(msg.id)
          if (cb) {
            this.pending.delete(msg.id)
            if (msg.error) {
              cb.reject(new Error(`MCP-Fehler: ${msg.error.message}`))
            } else {
              cb.resolve(msg.result)
            }
          }
        }
        // Nachrichten ohne ID sind Server-Notifications → aktuell ignorieren
      } catch {
        // Nicht-JSON-Ausgabe (z.B. Startup-Logs trotz stderr-Redirect)
        if (trimmed.length > 0) {
          console.log(`[MCP/${this.serverName}] stdout:`, trimmed)
        }
      }
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [, cb] of this.pending) cb.reject(err)
    this.pending.clear()
  }

  /**
   * Sendet einen JSON-RPC-Request und wartet auf die Antwort.
   */
  private sendRequest(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin) {
        reject(new Error('MCP-Prozess nicht gestartet'))
        return
      }

      const id = this.nextId++
      this.pending.set(id, { resolve, reject })

      const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
      try {
        this.proc.stdin.write(JSON.stringify(req) + '\n')
      } catch (err) {
        this.pending.delete(id)
        reject(err)
      }
    })
  }

  /**
   * Sendet eine JSON-RPC-Notification (keine Antwort erwartet).
   */
  private sendNotification(method: string, params?: unknown): void {
    if (!this.proc?.stdin) return
    const msg: JsonRpcNotification = { jsonrpc: '2.0', method, params }
    try {
      this.proc.stdin.write(JSON.stringify(msg) + '\n')
    } catch {
      // Ignorieren wenn Prozess nicht mehr schreibbar
    }
  }

  /**
   * Ruft die Tool-Liste vom MCP-Server ab.
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    const result = await this.sendRequest('tools/list', {}) as {
      tools?: MCPToolDefinition[]
    }
    return result?.tools ?? []
  }

  /**
   * Ruft ein Tool auf dem MCP-Server auf.
   * @param name - Name des Tools
   * @param args - Argumente gemäß inputSchema des Tools
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args  // MCP-Spec: "arguments" (nicht "args" oder "params")
    }) as MCPToolResult
    return result
  }

  /**
   * Beendet den MCP-Server-Prozess sauber.
   */
  stop(): void {
    this.isReady = false
    this.rejectAllPending(new Error('MCP-Client gestoppt'))

    try { this.proc?.stdin?.end() } catch { /* ignorieren */ }
    try { this.proc?.kill('SIGTERM') } catch { /* ignorieren */ }

    this.proc = null
    this.buffer = ''
    this.pending.clear()
  }
}
