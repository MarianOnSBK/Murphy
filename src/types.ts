// Gemeinsame Typen für Electron-Hauptprozess, Preload und React-Renderer

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface WorkflowMetadata {
  id: string
  name: string
  description: string
  stepCount: number
  createdAt: number
  lastRunAt: number | null
}

export interface MCPServerConfig {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  enabled: boolean
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>
}
