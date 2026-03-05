interface LiveBrowserViewProps {
  /** Base64-kodierter Screenshot vom Browser (PNG) */
  screenshotBase64?: string
  /** Ob der Browser gerade aktiv ist */
  isActive: boolean
  /** Aktuell besuchte URL */
  currentUrl?: string
}

export function LiveBrowserView({ screenshotBase64, isActive, currentUrl }: LiveBrowserViewProps) {
  if (!isActive) return null

  return (
    <div className="live-browser-view">
      <div className="browser-toolbar">
        <span className="live-badge">● LIVE</span>
        {currentUrl && (
          <span className="current-url" title={currentUrl}>
            {currentUrl}
          </span>
        )}
      </div>

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
          </div>
        )}
      </div>
    </div>
  )
}
