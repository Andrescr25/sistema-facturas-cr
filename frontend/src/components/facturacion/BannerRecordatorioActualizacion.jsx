import { AlertCircle, RefreshCw } from 'lucide-react'

/**
 * Recordatorio semanal (domingo/lunes) de sincronizar el catálogo antes de
 * facturar. Extraído de Facturacion.jsx.
 */
export default function BannerRecordatorioActualizacion({ isMobile, isOnline, syncingCache, onActualizarCache, onOcultar }) {
  return (
    <div className={`${isMobile ? 'px-4 mb-4' : 'mb-6'}`}>
      <div className="card border border-yellow-200 bg-gradient-to-r from-yellow-50 to-blue-50 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-yellow-600 flex-shrink-0" size={isMobile ? 20 : 24} />
          <div>
            <p className="text-base font-semibold text-yellow-900">
              Actualiza el sistema antes de facturar
            </p>
            <p className="text-sm text-yellow-800">
              Cada domingo y lunes recuerda sincronizar el catálogo para trabajar con precios y clientes actualizados.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <button
            onClick={onActualizarCache}
            disabled={!isOnline || syncingCache}
            className="btn btn-primary flex-1 sm:flex-initial flex items-center justify-center gap-2"
          >
            <RefreshCw size={16} className={syncingCache ? 'animate-spin' : ''} />
            Actualizar ahora
          </button>
          <button
            onClick={onOcultar}
            className="btn btn-ghost text-sm text-gray-600 hover:text-gray-900"
          >
            Ya actualicé
          </button>
        </div>
      </div>
    </div>
  )
}
