import { ClipboardList, RefreshCw } from 'lucide-react'

/**
 * Encabezado fijo de la página de despacho: título + indicador de
 * sincronización. Extraído de FacturasBodega.jsx (antes renderHeader).
 */
export default function HeaderBodega({ refreshing, ultimaSync }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b pb-4 mb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList className="text-blue-600" size={24} />
          Despacho en Bodega
        </h1>
        <p className="text-sm text-gray-500">Registra de manera ágil los pedidos que salen de bodega.</p>
      </div>
      <div className="flex items-center gap-3">
        {refreshing && (
          <span className="flex items-center gap-1.5 text-xs text-blue-600 font-medium animate-pulse">
            <RefreshCw size={12} className="animate-spin" />
            Sincronizando...
          </span>
        )}
        <div className="text-xs text-gray-400">
          Sync: {ultimaSync
            ? new Date(ultimaSync).toLocaleTimeString('es-CR', {
              hour: '2-digit',
              minute: '2-digit'
            })
            : '—'}
        </div>
      </div>
    </div>
  )
}
