import { CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/inventarioAuditoriaUtils'

/**
 * Reporte de una auditoría ya finalizada: resumen + lista de discrepancias
 * (izquierda), y la acción correctiva de ajustar el inventario en Alegra
 * (derecha). Extraído de InventarioAuditoria.jsx.
 */
export default function ReporteFinalizado({
  auditoriaActiva,
  adjustmentsPreview,
  loadingAjuste,
  successAjuste,
  error,
  onAplicarAjuste
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
      {/* Main Left: Audit details & list of adjustments made */}
      <div className="md:col-span-2 space-y-6">
        {/* Final state info alert */}
        <div className="bg-green-50 text-green-950 border border-green-200 p-5 rounded-3xl flex items-start gap-4">
          <CheckCircle className="text-green-600 shrink-0 mt-0.5" size={28} />
          <div className="space-y-1.5 text-sm">
            <h4 className="font-extrabold text-green-900 text-base">Auditoría Cerrada Exitosamente</h4>
            <p>
              El conteo físico de stock concluyó el <strong>{formatDate(auditoriaActiva.fecha_finalizacion)}</strong> con un porcentaje de precisión de <strong>{Number(auditoriaActiva.precision_porcentaje).toFixed(1)}%</strong>.
            </p>
            {auditoriaActiva.observaciones && (
              <p className="italic bg-white/50 p-2.5 rounded-xl border border-green-150 text-xs text-green-800 mt-2 block">
                Observaciones: "{auditoriaActiva.observaciones}"
              </p>
            )}
          </div>
        </div>

        {/* List of differences / adjustments preview */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={18} />
              Detalle de Ajustes Requeridos ({adjustmentsPreview.length} discrepancias)
            </h3>
          </div>

          {adjustmentsPreview.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <CheckCircle size={36} className="text-green-500 mx-auto mb-2" />
              <p className="font-bold text-gray-700">¡Perfecto! No se encontraron discrepancias</p>
              <p className="text-xs text-gray-500 mt-0.5">El conteo físico de todos los productos coincidió 100% con el sistema.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 text-sm">
              {adjustmentsPreview.map((adj, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="font-bold text-gray-900">{adj.nombre}</p>
                    <p className="text-xs text-gray-400">
                      Ref: <strong className="text-gray-600 font-semibold">{adj.referencia || 'N/A'}</strong>
                      {adj.costo_unitario > 0 && ` • Costo: ${formatCurrency(adj.costo_unitario)}`}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`inline-block font-extrabold text-xs px-2.5 py-0.5 rounded-md uppercase ${adj.diferencia > 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                      }`}>
                      {adj.diferencia > 0 ? `+${adj.diferencia}` : adj.diferencia} unid.
                    </span>
                    <p className={`text-xs font-bold mt-1 ${adj.diferencia > 0 ? 'text-blue-600' : 'text-red-600'
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
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
          <h3 className="text-lg font-bold text-gray-900 border-b pb-2 flex items-center gap-1.5">
            <CheckCircle className="text-emerald-600" size={18} />
            Acción Correctiva
          </h3>

          <p className="text-xs text-gray-500 leading-relaxed">
            Una vez auditado el stock, es fundamental corregir los descuadres en el inventario oficial de Alegra para que coincidan con la existencia física real de la distribuidora.
          </p>

          {/* Success adjustment message */}
          {successAjuste && (
            <div className="bg-blue-50 text-blue-900 border border-blue-200 p-4 rounded-2xl text-xs flex items-start gap-2">
              <CheckCircle className="text-blue-600 shrink-0 mt-0.5" size={16} />
              <span>{successAjuste}</span>
            </div>
          )}

          {/* Error feedback */}
          {error && (
            <div className="bg-red-50 text-red-950 border border-red-200 p-4 rounded-2xl text-xs flex items-start gap-2">
              <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={onAplicarAjuste}
            disabled={loadingAjuste || adjustmentsPreview.length === 0}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-150 disabled:text-gray-400 text-white font-extrabold py-3.5 px-4 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            {loadingAjuste ? <RefreshCw className="animate-spin" size={18} /> : <CheckCircle size={18} />}
            {loadingAjuste ? 'Sincronizando...' : 'Ajustar Inventario en Alegra'}
          </button>

          {adjustmentsPreview.length === 0 && (
            <p className="text-[10px] text-gray-400 text-center">
              * No se requieren ajustes ya que no hay discrepancias.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
