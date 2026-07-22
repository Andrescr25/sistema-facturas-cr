import { CheckCircle } from 'lucide-react'
import { formatCurrency } from '../../utils/inventarioAuditoriaUtils'

/**
 * Barra flotante inferior (solo móvil) con el resumen de conteo y el botón
 * de finalizar, visible durante la ejecución activa. Extraído de
 * InventarioAuditoria.jsx.
 */
export default function BarraAccionMovil({ itemsStats, liveFinancialImpact, loading, onFinalizar }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:hidden flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          Conteo: {itemsStats.total - itemsStats.pendientes}/{itemsStats.total}
        </p>
        <p className={`text-xs font-extrabold ${liveFinancialImpact >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
          {formatCurrency(liveFinancialImpact)}
        </p>
      </div>

      <button
        onClick={onFinalizar}
        disabled={loading || itemsStats.pendientes > 0}
        className="bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white active:bg-gray-900 font-bold px-4 py-2.5 rounded-xl shadow flex items-center gap-1.5 text-sm shrink-0"
      >
        <CheckCircle size={18} />
        Finalizar
      </button>
    </div>
  )
}
