import { ArrowLeft, RefreshCw, Boxes, ChevronRight } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/inventarioAuditoriaUtils'

/**
 * Historial de sesiones de auditoría (tabla en desktop, tarjetas en
 * móvil), con recarga manual. Extraído de InventarioAuditoria.jsx.
 */
export default function HistorialAuditorias({ auditorias, loading, onVolver, onRefresh, onSelectAuditoria }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onVolver}
          className="text-sm font-bold text-neutro-500 hover:text-exito-600 flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft size={16} />
          Volver a Auditoría
        </button>
        <h2 className="text-xl font-extrabold text-neutro-900">Historial de Sesiones</h2>
      </div>

      <div className="bg-white rounded-3xl border border-neutro-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-neutro-100 flex justify-between items-center bg-neutro-50/50">
          <h2 className="text-xl font-bold text-neutro-900">Historial de Sesiones</h2>
          <button
            onClick={onRefresh}
            className="p-2 text-neutro-400 hover:text-exito-600 transition-colors"
            title="Recargar"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-exito-600' : ''} />
          </button>
        </div>

        {loading && auditorias.length === 0 ? (
          <div className="p-12 text-center text-neutro-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="animate-spin text-exito-600" size={32} />
            <span>Cargando historial de auditorías...</span>
          </div>
        ) : auditorias.length === 0 ? (
          <div className="p-12 text-center text-neutro-400 flex flex-col items-center justify-center gap-4">
            <Boxes size={48} className="text-neutro-300" />
            <div>
              <p className="text-lg font-bold text-neutro-700">No hay auditorías registradas</p>
              <p className="text-sm text-neutro-500 mt-1">Presiona "Nueva Auditoría" para comenzar tu primer conteo de stock.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="block sm:hidden divide-y divide-neutro-100">
              {auditorias.map((audit) => (
                <div
                  key={audit.id}
                  onClick={() => onSelectAuditoria(audit.id)}
                  className="p-4 active:bg-neutro-50 cursor-pointer flex flex-col gap-2"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-neutro-900">{audit.nombre}</h4>
                      <p className="text-xs text-neutro-400">
                        {formatDate(audit.fecha_creacion)} • <span className="capitalize">{audit.tipo}</span>
                      </p>
                    </div>
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      audit.estado === 'finalizado'
                        ? 'bg-exito-50 text-exito-700 border border-exito-200'
                        : 'bg-alerta-50 text-alerta-700 border border-alerta-200'
                    }`}>
                      {audit.estado === 'finalizado' ? 'Finalizada' : 'En Progreso'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs pt-1">
                    {audit.estado === 'finalizado' ? (
                      <div className="flex gap-4">
                        <span>
                          Precisión: <strong className="text-neutro-800">{Number(audit.precision_porcentaje).toFixed(1)}%</strong>
                        </span>
                        <span>
                          Descuadre: <span className={`font-extrabold ${Number(audit.descuadre_dinero) >= 0 ? 'text-primario-600' : 'text-peligro-600'}`}>
                            {formatCurrency(audit.descuadre_dinero)}
                          </span>
                        </span>
                      </div>
                    ) : (
                      <span className="text-neutro-400 italic">Conteo en curso</span>
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
                    <th className="px-6 py-4">Nombre / Sesión</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Precisión</th>
                    <th className="px-6 py-4 text-right">Descuadre</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutro-100 text-sm">
                  {auditorias.map((audit) => (
                    <tr
                      key={audit.id}
                      className="hover:bg-neutro-50/70 transition-colors cursor-pointer group"
                      onClick={() => onSelectAuditoria(audit.id)}
                    >
                      <td className="px-6 py-4">
                        <p className="font-bold text-neutro-900 group-hover:text-exito-700 transition-colors">{audit.nombre}</p>
                        {audit.categoria && (
                          <span className="text-xs text-neutro-400 bg-neutro-100 px-2 py-0.5 rounded-full mt-1 inline-block">
                            {audit.categoria}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 capitalize text-neutro-600 font-medium">
                        {audit.tipo === 'random' ? 'Aleatoria 50' : audit.tipo === 'categoria' ? 'Categoría' : 'Crítica'}
                      </td>
                      <td className="px-6 py-4 text-neutro-500">
                        {formatDate(audit.fecha_creacion)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 font-bold text-xs px-3 py-1 rounded-full uppercase tracking-wider ${
                          audit.estado === 'finalizado'
                            ? 'bg-exito-50 text-exito-700 border border-exito-200'
                            : 'bg-alerta-50 text-alerta-700 border border-alerta-200'
                        }`}>
                          {audit.estado === 'finalizado' ? 'Finalizada' : 'En Progreso'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-extrabold text-neutro-900">
                        {audit.estado === 'finalizado' ? `${Number(audit.precision_porcentaje).toFixed(1)}%` : '—'}
                      </td>
                      <td className={`px-6 py-4 text-right font-extrabold ${
                        audit.estado !== 'finalizado'
                          ? 'text-neutro-400'
                          : Number(audit.descuadre_dinero) >= 0
                            ? 'text-primario-600'
                            : 'text-peligro-600'
                      }`}>
                        {audit.estado === 'finalizado' ? formatCurrency(audit.descuadre_dinero) : '—'}
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
    </div>
  )
}
