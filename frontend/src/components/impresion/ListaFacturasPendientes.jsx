import { CheckCircle, AlertCircle, Edit, Printer } from 'lucide-react'
import { formatDate } from '../../utils/impresionUtils'

/**
 * Listado de facturas pendientes de impresión (con o sin cambios).
 * Extraído de Impresion.jsx.
 */
export default function ListaFacturasPendientes({ facturas, procesando, onVerPDF, onProcesarSinCambios, onAbrirRevision }) {
  if (facturas.length === 0) {
    return (
      <div className="text-center py-12 bg-white border border-dashed rounded-3xl p-6 text-neutro-400">
        <CheckCircle className="mx-auto text-exito-500 mb-2" size={36} />
        <h3 className="font-semibold text-neutro-700">¡Todo al día!</h3>
        <p className="text-xs text-neutro-400">No hay facturas pendientes de revisión ni impresión.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {facturas.map((factura) => {
        const esSinPendientes = factura.categoria === 'sin_pendientes'

        return (
          <div
            key={factura.reimpresion_id || factura.id}
            className="bg-white border border-neutro-100 rounded-3xl p-6 shadow-sm hover:border-primario-200 transition space-y-4"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primario-600 bg-primario-50 px-2.5 py-0.5 rounded-full">
                    # {factura.numero_factura}
                  </span>
                  {esSinPendientes ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-exito-50 text-exito-700 border border-exito-100">
                      <CheckCircle size={12} />
                      Lista (Bodega)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-alerta-50 text-alerta-700 border border-alerta-100">
                      <AlertCircle size={12} className="animate-pulse" />
                      Requiere Ajustes
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-neutro-900">{factura.cliente_nombre}</h3>
                <p className="text-xs text-neutro-400">
                  Fecha emisión: {formatDate(factura.fecha_emision)}
                </p>
                {!esSinPendientes && (
                  <p className="text-xxs font-semibold text-alerta-700 bg-alerta-50 px-2 py-0.5 rounded border border-alerta-100 inline-block">
                    {factura.total_ajustes} ajuste{factura.total_ajustes !== 1 ? 's' : ''} detectado{factura.total_ajustes !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              <div className="text-left md:text-right shrink-0">
                <p className="text-2xl font-black text-neutro-800">
                  ₡{(factura.total || 0).toLocaleString('es-CR')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-3 border-t border-neutro-50 justify-end">
              {esSinPendientes ? (
                <>
                  <button
                    onClick={() => onVerPDF(factura)}
                    className="px-4 py-2 rounded-xl text-xs font-bold border border-neutro-200 text-neutro-700 hover:bg-neutro-50 transition active:scale-[0.98]"
                  >
                    Ver PDF
                  </button>
                  <button
                    onClick={() => onProcesarSinCambios(factura, false)}
                    disabled={procesando}
                    className="px-4 py-2 rounded-xl text-xs font-bold border border-neutro-200 text-neutro-700 hover:bg-neutro-50 transition active:scale-[0.98]"
                  >
                    Marcar Impresa
                  </button>
                  <button
                    onClick={() => onProcesarSinCambios(factura, true)}
                    disabled={procesando}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-primario-600 hover:bg-primario-700 text-white shadow-md transition active:scale-[0.98] flex items-center gap-1.5"
                  >
                    <Printer size={14} />
                    Imprimir y Cerrar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onAbrirRevision(factura)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-primario-600 hover:bg-primario-700 text-white shadow-md transition active:scale-[0.98] flex items-center gap-1.5"
                >
                  <Edit size={14} />
                  Revisar y Aplicar
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
