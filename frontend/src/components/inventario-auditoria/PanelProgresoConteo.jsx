import { CheckSquare, CheckCircle, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '../../utils/inventarioAuditoriaUtils'

/**
 * Panel lateral (sticky) durante la ejecución de la auditoría: progreso del
 * conteo, estadísticas, notas, e impacto financiero en vivo, con los
 * botones de guardar/finalizar. Extraído de InventarioAuditoria.jsx.
 */
export default function PanelProgresoConteo({
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
        <CheckSquare className="text-exito-600" size={18} />
        Progreso del Conteo
      </h3>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-bold text-neutro-500">
          <span>Productos digitados</span>
          <span>{itemsStats.total - itemsStats.pendientes} / {itemsStats.total}</span>
        </div>
        <div className="w-full bg-neutro-100 rounded-full h-3 overflow-hidden">
          <div
            className="bg-exito-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${((itemsStats.total - itemsStats.pendientes) / itemsStats.total) * 100}%` }}
          />
        </div>
      </div>

      {/* Stats detail list */}
      <div className="divide-y divide-neutro-100 text-sm">
        <div className="py-2.5 flex justify-between">
          <span className="text-neutro-500 font-medium">Coinciden con sistema:</span>
          <span className="font-extrabold text-exito-600">{itemsStats.correctos}</span>
        </div>
        <div className="py-2.5 flex justify-between">
          <span className="text-neutro-500 font-medium">Con descuadre (Diferencia):</span>
          <span className="font-extrabold text-peligro-600">{itemsStats.descuadres}</span>
        </div>
        <div className="py-2.5 flex justify-between">
          <span className="text-neutro-500 font-medium">Conteo pendiente:</span>
          <span className="font-extrabold text-neutro-500">{itemsStats.pendientes}</span>
        </div>
        <div className="py-2.5 flex justify-between border-t-2 font-bold text-base pt-3">
          <span>Impacto financiero:</span>
          <span className={liveFinancialImpact >= 0 ? 'text-primario-600' : 'text-peligro-600'}>
            {formatCurrency(liveFinancialImpact)}
          </span>
        </div>
      </div>

      {/* Observaciones textarea */}
      <div className="space-y-1">
        <label className="label text-xs font-bold text-neutro-700 uppercase tracking-wider block mb-1">Notas de la Auditoría</label>
        <textarea
          value={observacionesFinales}
          onChange={(e) => setObservacionesFinales(e.target.value)}
          placeholder="Ingrese observaciones sobre roturas, mercadería vencida, etc."
          rows="3"
          className="input w-full resize-none py-2 px-3 border-2 border-neutro-300 focus:border-primario-500 rounded-xl text-sm"
        />
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-2">
        {itemsStats.pendientes > 0 && (
          <p className="text-xs text-alerta-700 bg-alerta-50 border border-alerta-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
            <AlertTriangle size={13} className="shrink-0" />
            Faltan {itemsStats.pendientes} producto(s) por contar antes de poder finalizar.
          </p>
        )}
        <button
          onClick={onFinalizar}
          disabled={loading || itemsStats.pendientes > 0}
          className="w-full bg-neutro-800 hover:bg-neutro-900 disabled:bg-neutro-200 disabled:text-neutro-400 text-white font-bold py-3 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95"
        >
          <CheckCircle size={18} />
          Finalizar Auditoría
        </button>
      </div>
    </div>
  )
}
