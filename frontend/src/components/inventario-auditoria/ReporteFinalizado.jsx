import { CheckCircle, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/inventarioAuditoriaUtils'

/**
 * Reporte de una auditoría (o devolución) ya finalizada: resumen + lista de
 * discrepancias/productos (izquierda), y la acción correctiva de ajustar el
 * movimientos confirmados (derecha).
 * `esDevolucion` solo cambia los textos — el cálculo (adjustmentsPreview) y
 * la acción de aplicar el ajuste son exactamente los mismos.
 */
export default function ReporteFinalizado({
  auditoriaActiva,
  adjustmentsPreview,
  error,
  esDevolucion = false
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
      {/* Main Left: Audit details & list of adjustments made */}
      <div className="md:col-span-2 space-y-6">
        {/* Final state info alert */}
        <div className="bg-exito-50 text-exito-950 border border-exito-200 p-5 rounded-3xl flex items-start gap-4">
          <CheckCircle className="text-exito-600 shrink-0 mt-0.5" size={28} />
          <div className="space-y-1.5 text-sm">
            <h4 className="font-extrabold text-exito-900 text-base">
              {esDevolucion ? 'Devolución Finalizada' : 'Auditoría Cerrada Exitosamente'}
            </h4>
            <p>
              {esDevolucion ? (
                <>La devolución se cerró el <strong>{formatDate(auditoriaActiva.fecha_finalizacion)}</strong> con {adjustmentsPreview.length} producto(s) registrados en el inventario propio.</>
              ) : (
                <>El conteo físico de stock concluyó el <strong>{formatDate(auditoriaActiva.fecha_finalizacion)}</strong> con un porcentaje de precisión de <strong>{Number(auditoriaActiva.precision_porcentaje).toFixed(1)}%</strong>.</>
              )}
            </p>
            {auditoriaActiva.observaciones && (
              <p className="italic bg-white/50 p-2.5 rounded-xl border border-exito-200 text-xs text-exito-800 mt-2 block">
                Observaciones: "{auditoriaActiva.observaciones}"
              </p>
            )}
          </div>
        </div>

        {/* List of differences / adjustments preview */}
        <div className="bg-white rounded-3xl border border-neutro-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-neutro-100 bg-neutro-50/50 flex justify-between items-center">
            <h3 className="font-bold text-neutro-900 flex items-center gap-2">
              <AlertTriangle className="text-peligro-500" size={18} />
              {esDevolucion
                ? `Movimientos de devolución (${adjustmentsPreview.length})`
                : `Detalle de ajustes aplicados (${adjustmentsPreview.length} discrepancias)`}
            </h3>
          </div>

          {adjustmentsPreview.length === 0 ? (
            <div className="p-8 text-center text-neutro-400">
              <CheckCircle size={36} className="text-exito-500 mx-auto mb-2" />
              <p className="font-bold text-neutro-700">
                {esDevolucion ? 'No hay productos agregados' : '¡Perfecto! No se encontraron discrepancias'}
              </p>
              <p className="text-xs text-neutro-500 mt-0.5">
                {esDevolucion ? 'Esta devolución se finalizó sin productos.' : 'El conteo físico de todos los productos coincidió 100% con el sistema.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutro-100 text-sm">
              {adjustmentsPreview.map((adj, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="font-bold text-neutro-900">{adj.nombre}</p>
                    <p className="text-xs text-neutro-400">
                      Ref: <strong className="text-neutro-600 font-semibold">{adj.referencia || 'N/A'}</strong>
                      {adj.costo_unitario > 0 && ` • Costo: ${formatCurrency(adj.costo_unitario)}`}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`inline-block font-extrabold text-xs px-2.5 py-0.5 rounded-md uppercase ${adj.diferencia > 0 ? 'bg-primario-100 text-primario-800' : 'bg-peligro-100 text-peligro-800'
                      }`}>
                      {adj.diferencia > 0 ? `+${adj.diferencia}` : adj.diferencia} unid.
                    </span>
                    <p className={`text-xs font-bold mt-1 ${adj.diferencia > 0 ? 'text-primario-600' : 'text-peligro-600'
                      }`}>
                      {adj.diferencia > 0 ? '+' : ''}{formatCurrency(adj.impacto_dinero)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Corrective actions */}
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-3xl border border-neutro-100 shadow-sm space-y-5">
          <h3 className="text-lg font-bold text-neutro-900 border-b pb-2 flex items-center gap-1.5">
            <CheckCircle className="text-exito-600" size={18} />
            Movimiento confirmado
          </h3>

          <p className="text-xs text-neutro-500 leading-relaxed">
            El conteo y sus movimientos se confirmaron juntos al finalizar. El kardex conserva la cantidad, el origen y el responsable del ajuste.
          </p>

          {/* Error feedback */}
          {error && (
            <div className="bg-peligro-50 text-peligro-950 border border-peligro-200 p-4 rounded-2xl text-xs flex items-start gap-2">
              <AlertTriangle className="text-peligro-600 shrink-0 mt-0.5" size={16} />
              <span>{error}</span>
            </div>
          )}

          <p className="text-sm font-bold text-exito-700">Aplicado al inventario propio</p>
        </div>
      </div>
    </div>
  )
}
