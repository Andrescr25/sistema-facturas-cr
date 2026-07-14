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
          className="text-sm font-bold text-gray-500 hover:text-emerald-600 flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft size={16} />
          Volver a Auditoría
        </button>
        <h2 className="text-xl font-extrabold text-gray-900">Historial de Sesiones</h2>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-900">Historial de Sesiones</h2>
          <button
            onClick={onRefresh}
            className="p-2 text-gray-400 hover:text-emerald-600 transition-colors"
            title="Recargar"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-emerald-600' : ''} />
          </button>
        </div>

        {loading && auditorias.length === 0 ? (
          <div className="p-12 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="animate-spin text-emerald-600" size={32} />
            <span>Cargando historial de auditorías...</span>
          </div>
        ) : auditorias.length === 0 ? (
          <div className="p-12 text-center text-gray-400 flex flex-col items-center justify-center gap-4">
            <Boxes size={48} className="text-gray-300" />
            <div>
              <p className="text-lg font-bold text-gray-700">No hay auditorías registradas</p>
              <p className="text-sm text-gray-500 mt-1">Presiona "Nueva Auditoría" para comenzar tu primer conteo de stock.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="block sm:hidden divide-y divide-gray-100">
              {auditorias.map((audit) => (
                <div
                  key={audit.id}
                  onClick={() => onSelectAuditoria(audit.id)}
                  className="p-4 active:bg-gray-50 cursor-pointer flex flex-col gap-2"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-gray-900">{audit.nombre}</h4>
                      <p className="text-xs text-gray-400">
                        {formatDate(audit.fecha_creacion)} • <span className="capitalize">{audit.tipo}</span>
                      </p>
                    </div>
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      audit.estado === 'finalizado'
                        ? 'bg-green-50 text-green-700 border border-green-150'
                        : 'bg-yellow-50 text-yellow-700 border border-yellow-150'
                    }`}>
                      {audit.estado === 'finalizado' ? 'Finalizada' : 'En Progreso'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs pt-1">
                    {audit.estado === 'finalizado' ? (
                      <div className="flex gap-4">
                        <span>
                          Precisión: <strong className="text-gray-800">{Number(audit.precision_porcentaje).toFixed(1)}%</strong>
                        </span>
                        <span>
                          Descuadre: <span className={`font-extrabold ${Number(audit.descuadre_dinero) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            {formatCurrency(audit.descuadre_dinero)}
                          </span>
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">Conteo en curso</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                    <th className="px-6 py-4">Nombre / Sesión</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Precisión</th>
                    <th className="px-6 py-4 text-right">Descuadre</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {auditorias.map((audit) => (
                    <tr
                      key={audit.id}
                      className="hover:bg-gray-50/70 transition-colors cursor-pointer group"
                      onClick={() => onSelectAuditoria(audit.id)}
                    >
                      <td className="px-6 py-4">
                        <p className="font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">{audit.nombre}</p>
                        {audit.categoria && (
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full mt-1 inline-block">
                            {audit.categoria}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 capitalize text-gray-600 font-medium">
                        {audit.tipo === 'random' ? 'Aleatoria 50' : audit.tipo === 'categoria' ? 'Categoría' : 'Crítica'}
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {formatDate(audit.fecha_creacion)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 font-bold text-xs px-3 py-1 rounded-full uppercase tracking-wider ${
                          audit.estado === 'finalizado'
                            ? 'bg-green-50 text-green-700 border border-green-150'
                            : 'bg-yellow-50 text-yellow-700 border border-yellow-150'
                        }`}>
                          {audit.estado === 'finalizado' ? 'Finalizada' : 'En Progreso'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-extrabold text-gray-900">
                        {audit.estado === 'finalizado' ? `${Number(audit.precision_porcentaje).toFixed(1)}%` : '—'}
                      </td>
                      <td className={`px-6 py-4 text-right font-extrabold ${
                        audit.estado !== 'finalizado'
                          ? 'text-gray-400'
                          : Number(audit.descuadre_dinero) >= 0
                            ? 'text-blue-600'
                            : 'text-red-600'
                      }`}>
                        {audit.estado === 'finalizado' ? formatCurrency(audit.descuadre_dinero) : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ChevronRight className="text-gray-400 group-hover:text-emerald-600 transition-colors inline-block" size={20} />
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
