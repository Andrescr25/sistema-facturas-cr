import { FileText, CheckCircle } from 'lucide-react'
import Boton from '../ui/Boton'
import { formatDate } from '../../utils/impresionUtils'

/**
 * El historial de Impresión: TODAS las facturas impresas, lo más nuevo
 * primero, de a 50. Solo para ver su PDF: no se recupera ni se borra nada
 * (2026-10-24, pedido del usuario). Antes eran 7 días y, por un rato ese mismo
 * día, 48 h con 24 para recuperar. Extraído de Impresion.jsx.
 */
export default function ListaFacturasProcesadas({ facturas, historial, onVerPDF, onVerMas }) {
  if (facturas.length === 0) {
    return (
      <div className="text-center py-12 bg-white border border-dashed rounded-3xl p-6 text-neutro-400">
        <FileText className="mx-auto text-neutro-400 mb-2" size={36} />
        <h3 className="font-semibold text-neutro-700">No hay facturas procesadas</h3>
        <p className="text-xs text-neutro-400">Las facturas impresas quedan aquí para ver su PDF.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="mb-4 p-4 bg-primario-50/50 rounded-2xl border border-primario-100 text-primario-900 text-sm">
        Aquí quedan todas las facturas impresas, para ver su PDF. Una factura impresa no se recupera:
        si hay que quitar algo se hace una nota de crédito; si hay que agregar algo, una factura nueva.
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
                <p className="text-xs text-neutro-500">Procesamiento: {formatDate(factura.fecha_procesamiento)}</p>
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
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2 pt-2">
        <p className="text-xs text-neutro-400">Mostrando {facturas.length} de {historial.total}</p>
        {historial.hayMas && (
          <Boton variante="secundario" className="min-h-11" onClick={onVerMas} cargando={historial.cargandoMas}>
            {historial.cargandoMas ? 'Cargando…' : 'Ver más'}
          </Boton>
        )}
      </div>
    </div>
  )
}
