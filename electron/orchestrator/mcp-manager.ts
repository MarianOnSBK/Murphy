import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { MCPConfig } from '../../src/types'
import type { OllamaTool, OllamaToolCall } from './ollama-client'

// Standard-Konfiguration — alle Server deaktiviert bis der Nutzer sie aktiviert
const DEFAULT_CONFIG: MCPConfig = {
  mcpServers: {
    'browser-use': {
      command: 'python',
      args: ['-m', 'mcp_server'],
      env: {
        OLLAMA_BASE_URL: 'http://localhost:11434',
        MODEL: 'qwen2.5:32b-instruct'
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
  private configPath: string = ''

  async initialize(): Promise<void> {
    this.configPath = join(app.getPath('userData'), 'mcp-config.json')
    this.loadConfig()

    // Hinweis: MCP-Server-Prozesse werden in Meilenstein 2 gestartet.
    // Für Meilenstein 1 (Chat-Grundgerüst) werden keine Server gestartet.
    console.log('MCPManager initialisiert. Aktivierte Server werden in M2 gestartet.')
  }

  private loadConfig(): void {
    // 1. Gespeicherte Nutzer-Konfiguration bevorzugen
    if (existsSync(this.configPath)) {
      const raw = readFileSync(this.configPath, 'utf-8')
      this.config = JSON.parse(raw) as MCPConfig
      return
    }

    // 2. Projekt-Konfigurationsdatei als Fallback
    const projectConfig = join(app.getAppPath(), 'mcp-config', 'servers.json')
    if (existsSync(projectConfig)) {
      const raw = readFileSync(projectConfig, 'utf-8')
      this.config = JSON.parse(raw) as MCPConfig
      return
    }

    // 3. Standard-Konfiguration verwenden
    this.config = DEFAULT_CONFIG
  }

  getConfig(): MCPConfig {
    return this.config
  }

  async saveConfig(config: MCPConfig): Promise<void> {
    this.config = config
    writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  /**
   * Gibt Tool-Definitionen aller aktiven MCP-Server zurück.
   * Meilenstein 1: Noch leer — wird in M2 implementiert.
   */
  async getAvailableTools(): Promise<OllamaTool[]> {
    // TODO (Meilenstein 2): Für jeden aktivierten und laufenden MCP-Server
    // die Tool-Definitionen über das MCP-Protokoll abrufen.
    return []
  }

  /**
   * Ruft ein Tool auf dem zuständigen MCP-Server auf.
   * Meilenstein 1: Noch nicht implementiert.
   */
  async callTool(
    toolName: string,
    _args: OllamaToolCall['function']['arguments']
  ): Promise<unknown> {
    // TODO (Meilenstein 2): MCP-Server-Prozess finden und Tool-Call weiterleiten.
    console.warn(`Tool-Call noch nicht implementiert: ${toolName}`)
    return null
  }

  shutdown(): void {
    // TODO (Meilenstein 2): Alle laufenden MCP-Server-Prozesse beenden.
  }
}
