import { FileText, CheckCircle, RotateCcw } from 'lucide-react'
import { formatDate } from '../../utils/impresionUtils'

/**
 * Historial de facturas procesadas (últimos 7 días), con opción de
 * recuperar si aún está dentro del plazo. Extraído de Impresion.jsx.
 */
export default function ListaFacturasProcesadas({ facturas, onVerPDF, onRecuperar }) {
  if (facturas.length === 0) {
    return (
      <div className="text-center py-12 bg-white border border-dashed rounded-3xl p-6 text-neutro-400">
        <FileText className="mx-auto text-neutro-400 mb-2" size={36} />
        <h3 className="font-semibold text-neutro-700">No hay facturas procesadas</h3>
        <p className="text-xs text-neutro-400">Las facturas procesadas aparecerán aquí por 7 días.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="mb-4 p-4 bg-primario-50/50 rounded-2xl border border-primario-100 text-primario-900 text-sm">
        <strong>Recuperación:</strong> Puedes recuperar facturas procesadas en los últimos 7 días. Para facturas más antiguas, edítalas desde la sección de Facturación.
      </div>

      <div className="space-y-3">
        {facturas.map((factura) => (
          <div key={factura.reimpresion_id} className="bg-white border border-neutro-100 rounded-3xl p-6 shadow-sm hover:border-primario-200 transition space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primario-600 bg-primario-50 px-2.5 py-0.5 rounded-full">
                    # {factura.numero_factura}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-exito-50 text-exito-700 border border-exito-100">
                    <CheckCircle size={12} />
                    Procesada
                  </span>
                </div>
                <h3 className="text-lg font-bold text-neutro-900">{factura.cliente_nombre}</h3>
                <div className="text-xs text-neutro-500 space-y-0.5">
                  <p>Procesamiento: {formatDate(factura.fecha_procesamiento)}</p>
                  <p>
                    {factura.puede_recuperar ? (
                      <span className="text-exito-600 font-medium">
                        {factura.dias_restantes_recuperacion} días restantes para recuperar
                      </span>
                    ) : (
                      <span className="text-peligro-600 font-medium">
                        Período de recuperación expirado
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="text-left md:text-right shrink-0">
                <p className="text-2xl font-black text-neutro-800">
                  ₡{(factura.total || 0).toLocaleString('es-CR')}
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-neutro-50">
              <button
                onClick={() => onVerPDF(factura)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-neutro-200 text-neutro-700 hover:bg-neutro-50 transition active:scale-[0.98]"
              >
                Ver PDF
              </button>
              {factura.puede_recuperar && (
                <button
                  onClick={() => onRecuperar(factura)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-primario-600 hover:bg-primario-700 text-white shadow-md transition active:scale-[0.98] flex items-center gap-1"
                >
                  <RotateCcw size={14} />
                  Recuperar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
