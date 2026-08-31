import { AlertCircle, RefreshCw } from 'lucide-react'

/**
 * Recordatorio semanal (domingo/lunes) de sincronizar el catálogo antes de
 * facturar. Extraído de Facturacion.jsx.
 */
export default function BannerRecordatorioActualizacion({ isMobile, isOnline, syncingCache, onActualizarCache, onOcultar }) {
  return (
    <div className={`${isMobile ? 'px-4 mb-4' : 'mb-6'}`}>
      <div className="card border border-alerta-200 bg-gradient-to-r from-alerta-50 to-primario-50 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-alerta-600 flex-shrink-0" size={isMobile ? 20 : 24} />
          <div>
            <p className="text-base font-semibold text-alerta-900">
              Actualiza el sistema antes de facturar
            </p>
            <p className="text-sm text-alerta-800">
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
            className="btn btn-ghost text-sm text-neutro-600 hover:text-neutro-900"
          >
            Ya actualicé
          </button>
        </div>
      </div>
    </div>
  )
}
