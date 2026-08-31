import { PackageX, CheckCircle } from 'lucide-react'
import { formatCurrency } from '../../utils/inventarioAuditoriaUtils'

/**
 * Panel lateral durante la ejecución de un exceso: progreso de empaque y
 * botón de finalizar (bloqueado hasta que todos los productos estén
 * marcados como empacados).
 */
export default function PanelFinalizarExceso({
  items,
  observacionesFinales,
  setObservacionesFinales,
  loading,
  onFinalizar
}) {
  const total = items.length
  const empacados = items.filter(i => i.empacado).length
  const faltan = total - empacados
  const todoListo = faltan === 0

  const corregidos = items.filter(i => i.empacado && i.ajustado_alegra).length
  const sinCambios = empacados - corregidos
  const impactoCorrecciones = items
    .filter(i => i.empacado && i.ajustado_alegra && i.stock_real !== null)
    .reduce((acc, i) => acc + (Number(i.stock_real) - Number(i.stock_sistema)) * Number(i.costo_unitario || 0), 0)

  return (
    <div className="bg-white p-6 rounded-3xl border border-neutro-100 shadow-sm space-y-5 sticky top-6">
      <h3 className="text-lg font-bold text-neutro-900 border-b pb-2 flex items-center gap-1.5">
        <PackageX className="text-exito-600" size={18} />
        Progreso de Empaque
      </h3>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-bold text-neutro-500">
          <span>Productos empacados</span>
          <span>{empacados} / {total}</span>
        </div>
        <div className="w-full bg-neutro-100 rounded-full h-3 overflow-hidden">
          <div
            className="bg-exito-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${total > 0 ? (empacados / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {!todoListo && (
        <p className="text-xs text-alerta-700 bg-alerta-50 border border-alerta-100 rounded-lg px-3 py-2">
          Faltan {faltan} producto(s) por marcar antes de poder finalizar.
        </p>
      )}

      {empacados > 0 && (
        <div className="text-sm border-t pt-3 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-neutro-500 font-medium">Empacados sin cambios:</span>
            <span className="font-extrabold text-neutro-700">{sinCambios}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutro-500 font-medium">Empacados con corrección:</span>
            <span className="font-extrabold text-alerta-600">{corregidos}</span>
          </div>
          {corregidos > 0 && (
            <div className="flex justify-between border-t pt-1.5 font-bold">
              <span>Impacto de correcciones:</span>
              <span className={impactoCorrecciones >= 0 ? 'text-primario-600' : 'text-peligro-600'}>
                {impactoCorrecciones >= 0 ? '+' : ''}
                {formatCurrency(impactoCorrecciones)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1">
        <label className="label text-xs font-bold text-neutro-700 uppercase tracking-wider block mb-1">Notas</label>
        <textarea
          value={observacionesFinales}
          onChange={(e) => setObservacionesFinales(e.target.value)}
          placeholder="Ej: quién empacó, observaciones generales..."
          rows="3"
          className="input w-full resize-none py-2 px-3 border-2 border-neutro-300 focus:border-primario-500 rounded-xl text-sm"
        />
      </div>

      <button
        onClick={onFinalizar}
        disabled={loading || !todoListo}
        className="w-full bg-neutro-800 hover:bg-neutro-900 disabled:bg-neutro-200 disabled:text-neutro-400 text-white font-bold py-3 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95"
      >
        <CheckCircle size={18} />
        Finalizar Exceso
      </button>
    </div>
  )
}
