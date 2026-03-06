interface LiveBrowserViewProps {
  /** Base64-kodierter Screenshot vom Browser (PNG) */
  screenshotBase64?: string
  /** Ob der Browser gerade aktiv ist */
  isActive: boolean
  /** Aktuell besuchte URL (optional, Browser Use liefert diese nicht direkt) */
  currentUrl?: string
  /** Callback zum Schließen der Live-Ansicht */
  onClose?: () => void
}

export function LiveBrowserView({
  screenshotBase64,
  isActive,
  currentUrl,
  onClose
}: LiveBrowserViewProps) {
  if (!isActive) return null

  return (
    <div className="live-browser-view">
      {/* Toolbar */}
      <div className="browser-toolbar">
        <span className="live-badge">● LIVE</span>
        {currentUrl && (
          <span className="current-url" title={currentUrl}>
            {currentUrl}
          </span>
        )}
        <button
          className="browser-close-btn"
          onClick={onClose}
          title="Live-Ansicht schließen"
          aria-label="Schließen"
        >
          ✕
        </button>
      </div>

      {/* Screenshot oder Ladeindikator */}
      <div className="browser-content">
        {screenshotBase64 ? (
          <img
            src={`data:image/png;base64,${screenshotBase64}`}
            alt="Browser-Screenshot (Live-Ansicht)"
            className="browser-screenshot"
          />
        ) : (
          <div className="browser-placeholder">
            <span className="spinner" />
            <p>Browser wird gestartet…</p>
            <p className="hint">Screenshot erscheint nach der ersten Aktion.</p>
          </div>
        )}
      </div>
    </div>
  )
}
