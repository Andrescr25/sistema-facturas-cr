import { useState, useEffect, useRef } from 'react'
import { Search, X, Loader2, Info } from 'lucide-react'

export default function HeaderCatalogo({ searchQuery, setSearchQuery, isSyncing, lastSync, isOnline, synchronize }) {
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false)
      } else if (currentScrollY < lastScrollY) {
        setIsVisible(true)
      }
      setLastScrollY(currentScrollY)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [lastScrollY])

  const [isPressing, setIsPressing] = useState(false)
  const pressTimer = useRef(null)

  const handlePointerDown = (e) => {
    if (isSyncing || !isOnline || e.button !== 0) return
    setIsPressing(true)
    pressTimer.current = setTimeout(() => {
      setIsPressing(false)
      synchronize()
    }, 3000)
  }

  const handlePointerUpOrLeave = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    setIsPressing(false)
  }

  useEffect(() => {
    return () => {
      if (pressTimer.current) clearTimeout(pressTimer.current)
    }
  }, [])

  const clearSearch = () => setSearchQuery('')

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Nunca'
    const date = new Date(timestamp)
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <header className={`app-header header ${isVisible ? '' : 'header-hidden'}`}>
      <div className="header-top">
        <div className="logo-section">
          <img src="/catalogo-publico-logo.png" alt="Logo" className="company-logo" />
        </div>
        <div className="header-actions">
          <button
            className={`btn btn-outline ${isPressing ? 'pressing' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUpOrLeave}
            onPointerLeave={handlePointerUpOrLeave}
            onContextMenu={(e) => e.preventDefault()}
            disabled={isSyncing || !isOnline}
            style={{ position: 'relative', overflow: 'hidden' }}
          >
            {isPressing && <div className="press-progress"></div>}
            {isSyncing ? (
              <>
                <Loader2 className="btn-icon spin" size={16} />
                <span className="btn-text">Actualizando...</span>
              </>
            ) : (
              <span className="btn-text">Actualizar Catálogo</span>
            )}
          </button>
        </div>
      </div>

      <div className="sync-info">
        <div className="sync-status">{isSyncing ? 'Sincronizando...' : isOnline ? 'En línea' : 'Modo Offline'}</div>
        <div className="last-sync-time">Última act: {formatDate(lastSync)}</div>
      </div>

      <div className="search-container">
        <div className="search-box">
          <Search className="search-icon" size={18} />
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por nombre o referencia..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={clearSearch}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {!isOnline && (
        <div className="offline-banner" style={{ display: 'flex' }}>
          <Info size={16} /> Estás viendo la versión offline guardada en este dispositivo
        </div>
      )}
    </header>
  )
}
