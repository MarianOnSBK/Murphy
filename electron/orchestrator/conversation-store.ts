import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import type { ChatMessage, Conversation } from '../../src/types'

// Datenbankzeilen-Typen (snake_case von SQLite → camelCase für TypeScript)
interface ConversationRow {
  id: string
  title: string
  created_at: number
  updated_at: number
}

interface MessageRow {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export class ConversationStore {
  private db: Database.Database | null = null

  initialize(): void {
    const dbPath = join(app.getPath('userData'), 'conversations.sqlite')
    this.db = new Database(dbPath)
    // WAL-Modus für bessere Performance bei gleichzeitigen Lese-/Schreibzugriffen
    this.db.pragma('journal_mode = WAL')
    this.createTables()
  }

  private createTables(): void {
    if (!this.db) throw new Error('Datenbank nicht initialisiert')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id         TEXT    PRIMARY KEY,
        title      TEXT    NOT NULL DEFAULT 'Neue Konversation',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content         TEXT NOT NULL,
        timestamp       INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_by_conversation
        ON messages(conversation_id, timestamp ASC);
    `)
  }

  /**
   * Erstellt eine neue leere Konversation und gibt sie zurück.
   */
  createConversation(): Conversation {
    if (!this.db) throw new Error('Datenbank nicht initialisiert')

    const now = Date.now()
    const conv: Conversation = {
      id: randomUUID(),
      title: 'Neue Konversation',
      createdAt: now,
      updatedAt: now
    }

    this.db
      .prepare(
        'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
      )
      .run(conv.id, conv.title, conv.createdAt, conv.updatedAt)

    return conv
  }

  /**
   * Aktualisiert den Titel einer Konversation (z.B. aus der ersten Nachricht ableiten).
   */
  updateConversationTitle(conversationId: string, title: string): void {
    if (!this.db) throw new Error('Datenbank nicht initialisiert')

    this.db
      .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, Date.now(), conversationId)
  }

  /**
   * Speichert eine Nachricht. Legt die Konversation automatisch an falls sie fehlt.
   */
  saveMessage(conversationId: string, message: ChatMessage): void {
    if (!this.db) throw new Error('Datenbank nicht initialisiert')

    // Konversation anlegen wenn noch nicht vorhanden
    const existing = this.db
      .prepare('SELECT id FROM conversations WHERE id = ?')
      .get(conversationId)

    if (!existing) {
      const now = Date.now()
      this.db
        .prepare(
          'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
        )
        .run(conversationId, 'Neue Konversation', now, now)
    }

    this.db
      .prepare(
        'INSERT INTO messages (id, conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)'
      )
      .run(message.id, conversationId, message.role, message.content, message.timestamp)

    // Konversation als "zuletzt aktualisiert" markieren
    this.db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(Date.now(), conversationId)
  }

  /**
   * Gibt alle Nachrichten einer Konversation chronologisch zurück.
   */
  getMessages(conversationId: string): ChatMessage[] {
    if (!this.db) throw new Error('Datenbank nicht initialisiert')

    const rows = this.db
      .prepare(
        'SELECT id, role, content, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC'
      )
      .all(conversationId) as MessageRow[]

    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp
    }))
  }

  /**
   * Gibt alle Konversationen sortiert nach letzter Aktivität zurück.
   */
  listConversations(): Conversation[] {
    if (!this.db) throw new Error('Datenbank nicht initialisiert')

    const rows = this.db
      .prepare(
        'SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC'
      )
      .all() as ConversationRow[]

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  close(): void {
    this.db?.close()
    this.db = null
  }
}
