import { FileText, Wifi, WifiOff, AlertCircle, RefreshCw } from 'lucide-react'

/**
 * Encabezado de facturación (sticky en móvil): título, indicador de
 * conexión, contador de pendientes, y botón de actualizar catálogo.
 * Extraído de Facturacion.jsx.
 */
export default function HeaderFacturacion({ isMobile, isOnline, facturasPendientesCount, syncingCache, onActualizarCache }) {
  return (
    <div className={`${isMobile ? 'sticky top-0 z-40 bg-white shadow-md px-4 py-3' : 'mb-6'}`}>
      <div className={`${isMobile ? '' : 'flex items-center justify-between'}`}>
        <div className={isMobile ? 'mb-3' : ''}>
          <h1 className={`${isMobile ? 'text-xl' : 'text-3xl'} font-bold text-neutro-900 flex items-center gap-2`}>
            <FileText className="text-primario-600" size={isMobile ? 24 : 32} />
            Facturación
            {isMobile && (
              <span className="ml-auto text-xs px-2 py-1 bg-primario-100 text-primario-700 rounded-full">
                {isOnline ? '🟢' : '🔴'}
              </span>
            )}
          </h1>
          {!isMobile && (
            <p className="text-neutro-600 mt-1">
              Sistema de facturación con soporte offline
            </p>
          )}
        </div>

        <div className={`flex ${isMobile ? 'justify-between' : ''} items-center gap-2`}>
          {/* Indicador de conexión - Solo desktop */}
          {!isMobile && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isOnline ? 'bg-exito-100 text-exito-800' : 'bg-alerta-100 text-alerta-800'
              }`}>
              {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span className="text-sm font-medium">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          )}

          {/* Facturas pendientes */}
          {facturasPendientesCount > 0 && (
            <div className={`bg-alerta-100 text-alerta-800 px-3 py-2 rounded-lg flex items-center gap-2 ${isMobile ? 'text-xs' : 'text-sm'
              }`}>
              <AlertCircle size={isMobile ? 14 : 16} />
              <span className="font-medium">
                {facturasPendientesCount}
              </span>
            </div>
          )}

          {/* Botón actualizar cache */}
          <button
            onClick={onActualizarCache}
            disabled={!isOnline || syncingCache}
            className={`btn btn-outline flex items-center gap-2 ${isMobile ? 'text-xs px-2 py-1.5' : ''
              }`}
            title="Actualizar catálogo"
          >
            <RefreshCw size={isMobile ? 14 : 16} className={syncingCache ? 'animate-spin' : ''} />
            {!isMobile && 'Actualizar'}
          </button>
        </div>
      </div>
    </div>
  )
}
