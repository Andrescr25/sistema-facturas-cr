import { RefreshCw, Undo2, ChevronRight } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/inventarioAuditoriaUtils'

/**
 * Lista de devoluciones (tabla en desktop, tarjetas en móvil). Mismo
 * espíritu que HistorialAuditorias.jsx, pero sin las columnas de
 * tipo/precisión (no aplican a una devolución) — en su lugar muestra el
 * valor total reingresado.
 */
export default function HistorialDevoluciones({ devoluciones, loading, onRefresh, onSelectDevolucion }) {
  return (
    <div className="bg-white rounded-3xl border border-neutro-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-neutro-100 flex justify-between items-center bg-neutro-50/50">
        <h2 className="text-xl font-bold text-neutro-900">Devoluciones</h2>
        <button
          onClick={onRefresh}
          className="p-2 text-neutro-400 hover:text-exito-600 transition-colors"
          title="Recargar"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin text-exito-600' : ''} />
        </button>
      </div>

      {loading && devoluciones.length === 0 ? (
        <div className="p-12 text-center text-neutro-400 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="animate-spin text-exito-600" size={32} />
          <span>Cargando devoluciones...</span>
        </div>
      ) : devoluciones.length === 0 ? (
        <div className="p-12 text-center text-neutro-400 flex flex-col items-center justify-center gap-4">
          <Undo2 size={48} className="text-neutro-300" />
          <div>
            <p className="text-lg font-bold text-neutro-700">No hay devoluciones registradas</p>
            <p className="text-sm text-neutro-500 mt-1">Presiona "Nueva Devolución" para reingresar productos devueltos al inventario.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Card List */}
          <div className="block sm:hidden divide-y divide-neutro-100">
            {devoluciones.map((dev) => (
              <div
                key={dev.id}
                onClick={() => onSelectDevolucion(dev.id)}
                className="p-4 active:bg-neutro-50 cursor-pointer flex flex-col gap-2"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-neutro-900">{dev.nombre}</h4>
                    <p className="text-xs text-neutro-400">{formatDate(dev.fecha_creacion)}</p>
                  </div>
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    dev.estado === 'finalizado'
                      ? 'bg-exito-50 text-exito-700 border border-exito-200'
                      : 'bg-alerta-50 text-alerta-700 border border-alerta-200'
                  }`}>
                    {dev.estado === 'finalizado' ? 'Finalizada' : 'En Progreso'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1">
                  {dev.estado === 'finalizado' ? (
                    <span>
                      Valor reingresado: <strong className="text-primario-600">{formatCurrency(dev.descuadre_dinero)}</strong>
                    </span>
                  ) : (
                    <span className="text-neutro-400 italic">Agregando productos</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutro-50 text-xs font-bold text-neutro-400 uppercase tracking-wider border-b border-neutro-100">
                  <th className="px-6 py-4">Nombre</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-right">Valor Reingresado</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutro-100 text-sm">
                {devoluciones.map((dev) => (
                  <tr
                    key={dev.id}
                    className="hover:bg-neutro-50/70 transition-colors cursor-pointer group"
                    onClick={() => onSelectDevolucion(dev.id)}
                  >
                    <td className="px-6 py-4">
                      <p className="font-bold text-neutro-900 group-hover:text-exito-700 transition-colors">{dev.nombre}</p>
                    </td>
                    <td className="px-6 py-4 text-neutro-500">
                      {formatDate(dev.fecha_creacion)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 font-bold text-xs px-3 py-1 rounded-full uppercase tracking-wider ${
                        dev.estado === 'finalizado'
                          ? 'bg-exito-50 text-exito-700 border border-exito-200'
                          : 'bg-alerta-50 text-alerta-700 border border-alerta-200'
                      }`}>
                        {dev.estado === 'finalizado' ? 'Finalizada' : 'En Progreso'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-extrabold text-primario-600">
                      {dev.estado === 'finalizado' ? formatCurrency(dev.descuadre_dinero) : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ChevronRight className="text-neutro-400 group-hover:text-exito-600 transition-colors inline-block" size={20} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
