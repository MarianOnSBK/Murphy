import type { WorkflowMetadata } from '../types'

interface WorkflowViewerProps {
  workflows: WorkflowMetadata[]
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function WorkflowViewer({ workflows }: WorkflowViewerProps) {
  if (workflows.length === 0) {
    return (
      <div className="workflow-viewer">
        <div className="view-header">
          <h2>Gelernte Workflows</h2>
        </div>
        <div className="empty-state">
          <div className="empty-icon">⚡</div>
          <p>Noch keine Workflows vorhanden.</p>
          <p className="hint">
            Workflows werden in Meilenstein 3 automatisch gespeichert, sobald Jarvis
            eine Web-Aufgabe erfolgreich abgeschlossen hat.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="workflow-viewer">
      <div className="view-header">
        <h2>Gelernte Workflows</h2>
        <span className="badge">{workflows.length}</span>
      </div>

      <div className="workflow-grid">
        {workflows.map((wf) => (
          <div key={wf.id} className="workflow-card">
            <div className="workflow-card-header">
              <h3 className="workflow-name">{wf.name}</h3>
              <span className="step-badge">{wf.stepCount} Schritte</span>
            </div>

            {wf.description && (
              <p className="workflow-description">{wf.description}</p>
            )}

            <div className="workflow-meta">
              <span>Erstellt: {formatDate(wf.createdAt)}</span>
              {wf.lastRunAt !== null && (
                <span>Zuletzt: {formatDate(wf.lastRunAt)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
