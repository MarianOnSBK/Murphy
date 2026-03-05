/**
 * MCP-Manager — Meilenstein 2
 *
 * Verwaltet den Lebenszyklus aller MCP-Server-Prozesse:
 * - Startet aktivierte Server beim Initialisieren
 * - Hält eine Tool-Index-Tabelle für schnelles Routing
 * - Leitet Tool-Calls an den richtigen Server weiter
 * - Extrahiert Screenshots aus Tool-Ergebnissen
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { MCPConfig } from '../../src/types'
import type { OllamaTool, OllamaToolCall } from './ollama-client'
import { MCPClient, type MCPToolResult, type MCPContentItem } from './mcp-client'

// Standard-Konfiguration — alle Server deaktiviert
const DEFAULT_CONFIG: MCPConfig = {
  mcpServers: {
    'browser-use': {
      command: 'python',
      args: ['-m', 'mcp_servers.browser_use_server'],
      env: {
        OLLAMA_BASE_URL: 'http://localhost:11434',
        MODEL: 'qwen2.5:7b-instruct'
      },
      enabled: false
    },
    ms365: {
      command: 'npx',
      args: ['-y', '@softeria/ms-365-mcp-server'],
      enabled: false
    },
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      enabled: false
    }
  }
}

export class MCPManager {
  private config: MCPConfig = DEFAULT_CONFIG
  private configPath = ''

  // Laufende MCP-Clients
  private clients = new Map<string, MCPClient>()

  // Tool-Name → Server-Name (für schnelles Routing)
  private toolIndex = new Map<string, string>()

  // Gecachte Tool-Definitionen im Ollama-Format
  private cachedTools: OllamaTool[] = []

  async initialize(): Promise<void> {
    this.configPath = join(app.getPath('userData'), 'mcp-config.json')
    this.loadConfig()
    await this.startEnabledServers()
  }

  private loadConfig(): void {
    if (existsSync(this.configPath)) {
      const raw = readFileSync(this.configPath, 'utf-8')
      this.config = JSON.parse(raw) as MCPConfig
      return
    }

    const projectConfig = join(app.getAppPath(), 'mcp-config', 'servers.json')
    if (existsSync(projectConfig)) {
      const raw = readFileSync(projectConfig, 'utf-8')
      this.config = JSON.parse(raw) as MCPConfig
      return
    }

    this.config = DEFAULT_CONFIG
  }

  /**
   * Startet alle aktivierten MCP-Server-Prozesse und registriert ihre Tools.
   */
  private async startEnabledServers(): Promise<void> {
    const enabledEntries = Object.entries(this.config.mcpServers).filter(
      ([, cfg]) => cfg.enabled
    )

    if (enabledEntries.length === 0) {
      console.log('[MCPManager] Keine aktivierten Server konfiguriert.')
      return
    }

    console.log(`[MCPManager] Starte ${enabledEntries.length} Server...`)

    for (const [name, serverConfig] of enabledEntries) {
      try {
        const client = new MCPClient()
        client.serverName = name

        await client.start(
          serverConfig.command,
          serverConfig.args,
          serverConfig.env,
          serverConfig.cwd
        )

        this.clients.set(name, client)

        // Tool-Index aufbauen
        const tools = await client.listTools()
        for (const tool of tools) {
          this.toolIndex.set(tool.name, name)
        }

        console.log(`[MCPManager] ${name}: ${tools.length} Tools registriert`)
      } catch (err) {
        console.error(`[MCPManager] ${name} konnte nicht gestartet werden:`, err)
      }
    }

    await this.rebuildToolCache()
  }

  /**
   * Fragt alle aktiven Server nach ihren Tools und baut den Ollama-kompatiblen Cache auf.
   */
  private async rebuildToolCache(): Promise<void> {
    const all: OllamaTool[] = []

    for (const [serverName, client] of this.clients) {
      if (!client.isReady) continue
      try {
        const mcpTools = await client.listTools()
        for (const tool of mcpTools) {
          all.push({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description ?? '',
              parameters: tool.inputSchema
            }
          })
        }
      } catch (err) {
        console.error(`[MCPManager] Tool-Liste von ${serverName} nicht ladbar:`, err)
      }
    }

    this.cachedTools = all
    console.log(`[MCPManager] ${all.length} Tools verfügbar`)
  }

  /**
   * Gibt alle verfügbaren Tools im Ollama-Format zurück.
   * Leere Liste wenn keine Server aktiv (M1-kompatibler Fallback).
   */
  async getAvailableTools(): Promise<OllamaTool[]> {
    return this.cachedTools
  }

  /**
   * Ruft ein Tool auf dem zuständigen MCP-Server auf.
   */
  async callTool(
    toolName: string,
    args: OllamaToolCall['function']['arguments']
  ): Promise<MCPToolResult> {
    const serverName = this.toolIndex.get(toolName)
    if (!serverName) {
      throw new Error(
        `Tool '${toolName}' unbekannt. Verfügbar: ${[...this.toolIndex.keys()].join(', ')}`
      )
    }

    const client = this.clients.get(serverName)
    if (!client || !client.isReady) {
      throw new Error(`MCP-Server '${serverName}' nicht bereit`)
    }

    return client.callTool(toolName, args as Record<string, unknown>)
  }

  /**
   * Extrahiert den Text-Inhalt aus einem MCPToolResult.
   */
  static extractText(result: MCPToolResult): string {
    return result.content
      .filter((c): c is MCPContentItem & { type: 'text'; text: string } =>
        c.type === 'text' && typeof c.text === 'string'
      )
      .map((c) => c.text)
      .join('\n')
  }

  /**
   * Extrahiert alle base64-PNG-Screenshots aus einem MCPToolResult.
   */
  static extractScreenshots(result: MCPToolResult): string[] {
    return result.content
      .filter(
        (c): c is MCPContentItem & { type: 'image'; data: string } =>
          c.type === 'image' && typeof c.data === 'string'
      )
      .map((c) => c.data)
  }

  getConfig(): MCPConfig {
    return this.config
  }

  async saveConfig(config: MCPConfig): Promise<void> {
    this.config = config
    writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('[MCPManager] Konfiguration gespeichert. App-Neustart für Änderungen nötig.')
  }

  /**
   * Beendet alle laufenden MCP-Server-Prozesse sauber.
   */
  shutdown(): void {
    for (const [name, client] of this.clients) {
      try {
        client.stop()
        console.log(`[MCPManager] ${name} beendet`)
      } catch (err) {
        console.error(`[MCPManager] Fehler beim Beenden von ${name}:`, err)
      }
    }
    this.clients.clear()
    this.toolIndex.clear()
    this.cachedTools = []
  }
}
