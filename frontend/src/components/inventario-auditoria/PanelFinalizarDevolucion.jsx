import { Undo2, CheckCircle } from 'lucide-react'
import { formatCurrency } from '../../utils/inventarioAuditoriaUtils'

/**
 * Panel lateral durante la ejecución de una devolución: resumen de lo
 * agregado hasta ahora, notas, y el botón para finalizar. Finalizar NO
 * aplica el ajuste en Alegra todavía — eso queda para el botón explícito
 * "Aplicar Ajuste en Alegra" del reporte finalizado (mismo que auditorías).
 */
export default function PanelFinalizarDevolucion({
  itemsStats,
  liveFinancialImpact,
  observacionesFinales,
  setObservacionesFinales,
  loading,
  onFinalizar
}) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-neutro-100 shadow-sm space-y-5 sticky top-6">
      <h3 className="text-lg font-bold text-neutro-900 border-b pb-2 flex items-center gap-1.5">
        <Undo2 className="text-exito-600" size={18} />
        Resumen de la Devolución
      </h3>

      <div className="divide-y divide-neutro-100 text-sm">
        <div className="py-2.5 flex justify-between">
          <span className="text-neutro-500 font-medium">Productos agregados:</span>
          <span className="font-extrabold text-neutro-900">{itemsStats.total}</span>
        </div>
        <div className="py-2.5 flex justify-between border-t-2 font-bold text-base pt-3">
          <span>Valor total a reingresar:</span>
          <span className="text-primario-600">{formatCurrency(liveFinancialImpact)}</span>
        </div>
      </div>

      <div className="space-y-1">
        <label className="label text-xs font-bold text-neutro-700 uppercase tracking-wider block mb-1">Notas</label>
        <textarea
          value={observacionesFinales}
          onChange={(e) => setObservacionesFinales(e.target.value)}
          placeholder="Ej: devolución de cliente X, factura Y..."
          rows="3"
          className="input w-full resize-none py-2 px-3 border-2 border-neutro-300 focus:border-primario-500 rounded-xl text-sm"
        />
      </div>

      <button
        onClick={onFinalizar}
        disabled={loading || itemsStats.total === 0}
        className="w-full bg-neutro-800 hover:bg-neutro-900 disabled:bg-neutro-200 disabled:text-neutro-400 text-white font-bold py-3 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95"
      >
        <CheckCircle size={18} />
        Finalizar Devolución
      </button>
    </div>
  )
}
