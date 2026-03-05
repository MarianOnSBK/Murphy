import { useState, useEffect } from 'react'
import type { MCPConfig, MCPServerConfig } from '../types'

export function SettingsPanel() {
  const [config, setConfig] = useState<MCPConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    window.jarvis.getSettings().then(setConfig)
  }, [])

  const toggleServer = (name: string) => {
    if (!config) return
    setConfig({
      ...config,
      mcpServers: {
        ...config.mcpServers,
        [name]: {
          ...config.mcpServers[name],
          enabled: !config.mcpServers[name].enabled
        }
      }
    })
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    try {
      await window.jarvis.saveSettings(config)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  if (!config) {
    return (
      <div className="settings-panel">
        <div className="loading-state">Lädt Einstellungen…</div>
      </div>
    )
  }

  const servers = Object.entries(config.mcpServers) as [string, MCPServerConfig][]

  return (
    <div className="settings-panel">
      <div className="view-header">
        <h2>Einstellungen</h2>
      </div>

      <section className="settings-section">
        <h3>MCP-Server</h3>
        <p className="section-hint">
          Jeder MCP-Server erweitert Jarvis um neue Fähigkeiten. Aktivierte Server
          werden beim nächsten Start automatisch gestartet.
        </p>

        <div className="server-list">
          {servers.map(([name, serverConfig]) => (
            <div key={name} className="server-card">
              <div className="server-info">
                <span className="server-name">{name}</span>
                <code className="server-cmd">
                  {serverConfig.command} {serverConfig.args.join(' ')}
                </code>
              </div>

              <label className="toggle-switch" title={serverConfig.enabled ? 'Deaktivieren' : 'Aktivieren'}>
                <input
                  type="checkbox"
                  checked={serverConfig.enabled}
                  onChange={() => toggleServer(name)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          ))}
        </div>
      </section>

      <div className="settings-actions">
        <button
          className={`save-btn ${saveSuccess ? 'success' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Speichert…' : saveSuccess ? '✓ Gespeichert' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}
