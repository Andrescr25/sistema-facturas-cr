export default function SyncOverlay({ isSyncing, syncProgress }) {
  if (!isSyncing) return null

  return (
    <div className="sync-overlay" style={{ display: 'flex' }}>
      <div className="sync-spinner"></div>
      <div className="sync-text">Sincronizando Catálogo...</div>
      <div className="sync-description">{syncProgress.message || 'Por favor espera...'}</div>
      <div className="sync-progress">
        <div className="sync-progress-fill" style={{ width: `${syncProgress.percent}%` }}></div>
      </div>
      <div className="sync-warning">No cierres esta pestaña durante la actualización.</div>
    </div>
  )
}
