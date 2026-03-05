import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'
import type { WorkflowMetadata } from '../../src/types'

// Vollständige Workflow-Daten (in JSON-Datei gespeichert)
export interface WorkflowData {
  id: string
  name: string
  description: string
  steps: WorkflowStep[]
  createdAt: number
  lastRunAt: number | null
}

// Einzelner Schritt in einem Workflow
export interface WorkflowStep {
  type: 'navigate' | 'click' | 'type' | 'wait' | 'screenshot' | 'scroll'
  description: string
  selector?: string      // CSS-Selektor für das Zielelement
  value?: string         // Eingabewert (z.B. für type-Schritte)
  url?: string           // Ziel-URL (für navigate-Schritte)
  timeout?: number       // Wartezeit in Millisekunden
}

interface WorkflowRow {
  id: string
  name: string
  description: string
  step_count: number
  created_at: number
  last_run_at: number | null
}

export class WorkflowStore {
  private db: Database.Database | null = null
  private workflowsDir: string = ''

  initialize(): void {
    const userData = app.getPath('userData')
    this.workflowsDir = join(userData, 'workflows')
    // Verzeichnis anlegen falls nicht vorhanden
    mkdirSync(this.workflowsDir, { recursive: true })

    this.db = new Database(join(userData, 'workflows.sqlite'))
    this.db.pragma('journal_mode = WAL')
    this.createTables()
  }

  private createTables(): void {
    if (!this.db) throw new Error('Datenbank nicht initialisiert')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id          TEXT    PRIMARY KEY,
        name        TEXT    NOT NULL,
        description TEXT    NOT NULL DEFAULT '',
        step_count  INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        last_run_at INTEGER
      );
    `)
  }

  /**
   * Speichert einen neuen Workflow.
   * Metadaten → SQLite, vollständige Schrittdaten → JSON-Datei.
   */
  saveWorkflow(data: Omit<WorkflowData, 'id' | 'createdAt'>): WorkflowMetadata {
    if (!this.db) throw new Error('Datenbank nicht initialisiert')

    const id = randomUUID()
    const now = Date.now()

    // Vollständige Daten als JSON speichern
    const workflowData: WorkflowData = { id, createdAt: now, ...data }
    const filePath = join(this.workflowsDir, `${id}.json`)
    writeFileSync(filePath, JSON.stringify(workflowData, null, 2), 'utf-8')

    // Metadaten in SQLite speichern
    this.db
      .prepare(
        'INSERT INTO workflows (id, name, description, step_count, created_at, last_run_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, data.name, data.description, data.steps.length, now, data.lastRunAt ?? null)

    return {
      id,
      name: data.name,
      description: data.description,
      stepCount: data.steps.length,
      createdAt: now,
      lastRunAt: data.lastRunAt ?? null
    }
  }

  /**
   * Lädt die vollständigen Workflow-Daten (inkl. Schritte) aus der JSON-Datei.
   */
  getWorkflow(id: string): WorkflowData | null {
    const filePath = join(this.workflowsDir, `${id}.json`)
    if (!existsSync(filePath)) return null
    return JSON.parse(readFileSync(filePath, 'utf-8')) as WorkflowData
  }

  /**
   * Gibt alle Workflow-Metadaten zurück (ohne Schrittdetails).
   */
  listWorkflows(): WorkflowMetadata[] {
    if (!this.db) throw new Error('Datenbank nicht initialisiert')

    const rows = this.db
      .prepare(
        'SELECT id, name, description, step_count, created_at, last_run_at FROM workflows ORDER BY created_at DESC'
      )
      .all() as WorkflowRow[]

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      stepCount: row.step_count,
      createdAt: row.created_at,
      lastRunAt: row.last_run_at
    }))
  }

  /**
   * Löscht einen Workflow aus SQLite und entfernt die JSON-Datei.
   */
  deleteWorkflow(id: string): void {
    if (!this.db) throw new Error('Datenbank nicht initialisiert')

    this.db.prepare('DELETE FROM workflows WHERE id = ?').run(id)

    const filePath = join(this.workflowsDir, `${id}.json`)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  }

  /**
   * Aktualisiert den Zeitstempel des letzten Ausführens.
   */
  markAsRun(id: string): void {
    if (!this.db) throw new Error('Datenbank nicht initialisiert')
    this.db.prepare('UPDATE workflows SET last_run_at = ? WHERE id = ?').run(Date.now(), id)
  }

  close(): void {
    this.db?.close()
    this.db = null
  }
}
