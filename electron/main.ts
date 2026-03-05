import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { Orchestrator } from './orchestrator/index'
import type { MCPConfig } from '../src/types'

// Entwicklungsmodus erkennen
const isDev = process.env.NODE_ENV === 'development'

let mainWindow: BrowserWindow | null = null
let orchestrator: Orchestrator | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Jarvis — Persönlicher KI-Assistent',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../../out/renderer/index.html'))
  }
}

async function initOrchestrator(): Promise<void> {
  // Status-Callback: Sendet Statusmeldungen an den Renderer
  const onStatusUpdate = (status: string): void => {
    mainWindow?.webContents.send('status:change', status)
  }

  // Token-Callback: Sendet einzelne Stream-Tokens an den Renderer
  const onStreamToken = (token: string, conversationId: string): void => {
    mainWindow?.webContents.send('chat:token', { token, conversationId })
  }

  // Screenshot-Callback: Sendet Browser-Screenshots (base64-PNG) an den Renderer
  const onBrowserScreenshot = (screenshotBase64: string, conversationId: string): void => {
    mainWindow?.webContents.send('browser:screenshot', { screenshotBase64, conversationId })
  }

  orchestrator = new Orchestrator(onStatusUpdate, onStreamToken, onBrowserScreenshot)
  await orchestrator.initialize()
}

// IPC-Handler: Nachricht vom Renderer empfangen und an Ollama weiterleiten
ipcMain.handle('chat:send', async (_event, content: string, conversationId: string) => {
  if (!orchestrator) throw new Error('Orchestrator nicht initialisiert')
  return orchestrator.sendMessage(content, conversationId)
})

// IPC-Handler: Konversationsverlauf laden
ipcMain.handle('chat:history', async (_event, conversationId: string) => {
  if (!orchestrator) throw new Error('Orchestrator nicht initialisiert')
  return orchestrator.getHistory(conversationId)
})

// IPC-Handler: Alle Konversationen auflisten
ipcMain.handle('conversation:list', async () => {
  if (!orchestrator) throw new Error('Orchestrator nicht initialisiert')
  return orchestrator.listConversations()
})

// IPC-Handler: Neue Konversation anlegen
ipcMain.handle('conversation:new', async () => {
  if (!orchestrator) throw new Error('Orchestrator nicht initialisiert')
  return orchestrator.createConversation()
})

// IPC-Handler: Workflow-Liste laden
ipcMain.handle('workflow:list', async () => {
  if (!orchestrator) throw new Error('Orchestrator nicht initialisiert')
  return orchestrator.listWorkflows()
})

// IPC-Handler: MCP-Server-Konfiguration laden
ipcMain.handle('settings:get', async () => {
  if (!orchestrator) throw new Error('Orchestrator nicht initialisiert')
  return orchestrator.getMcpConfig()
})

// IPC-Handler: MCP-Server-Konfiguration speichern
ipcMain.handle('settings:save', async (_event, config: MCPConfig) => {
  if (!orchestrator) throw new Error('Orchestrator nicht initialisiert')
  return orchestrator.saveMcpConfig(config)
})

// IPC-Handler: Ollama-Verbindungsstatus prüfen
ipcMain.handle('ollama:status', async () => {
  if (!orchestrator) throw new Error('Orchestrator nicht initialisiert')
  return orchestrator.getOllamaStatus()
})

app.whenReady().then(async () => {
  await initOrchestrator()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    orchestrator?.shutdown()
    app.quit()
  }
})
