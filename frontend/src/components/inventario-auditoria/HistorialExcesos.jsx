import { RefreshCw, PackageX, ChevronRight, Zap, Loader2, Plus, Trash2 } from 'lucide-react'
import { formatDate } from '../../utils/inventarioAuditoriaUtils'

/**
 * Lista de tandas de excesos: las que genera el cron cada domingo, las que
 * se piden con "Generar Ahora", y las que se arman a mano con "Nueva
 * tanda". Una vez creadas son todas iguales — se empacan con la misma
 * pantalla y se les pueden agregar o quitar productos.
 */
export default function HistorialExcesos({
  excesos, loading, generando, creando,
  onRefresh, onGenerarAhora, onSelectExceso, onCrearManual, onEliminar
}) {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <h2 className="text-xl font-bold text-gray-900">Excesos de Inventario</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onCrearManual}
            disabled={creando}
            title="Crear una tanda vacía y elegir los productos a mano"
            className="bg-white border border-emerald-200 hover:bg-emerald-50 disabled:opacity-50 text-emerald-700 text-xs font-bold py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5"
          >
            {creando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Nueva tanda
          </button>
          <button
            onClick={onGenerarAhora}
            disabled={generando}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white text-xs font-bold py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5"
          >
            {generando ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {generando ? 'Generando...' : 'Generar Ahora'}
          </button>
          <button
            onClick={onRefresh}
            className="p-2 text-gray-400 hover:text-emerald-600 transition-colors"
            title="Recargar"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-emerald-600' : ''} />
          </button>
        </div>
      </div>

      <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
        Se genera automáticamente todos los domingos a las 10pm: hasta 10 productos por semana, con stock y sin ventas registradas en los últimos 60 días.
        Con <strong>Nueva tanda</strong> podés armar una a mano con los productos que vos elijas.
      </div>

      {loading && excesos.length === 0 ? (
        <div className="p-12 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="animate-spin text-emerald-600" size={32} />
          <span>Cargando excesos...</span>
        </div>
      ) : excesos.length === 0 ? (
        <div className="p-12 text-center text-gray-400 flex flex-col items-center justify-center gap-4">
          <PackageX size={48} className="text-gray-300" />
          <div>
            <p className="text-lg font-bold text-gray-700">Todavía no hay reportes de excesos</p>
            <p className="text-sm text-gray-500 mt-1">Se generará automáticamente este domingo, o presiona "Generar Ahora".</p>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Card List */}
          <div className="block sm:hidden divide-y divide-gray-100">
            {excesos.map((exc) => (
              <div key={exc.id} className="p-4 flex items-center gap-3">
                <div
                  onClick={() => onSelectExceso(exc.id)}
                  className="flex-1 active:bg-gray-50 cursor-pointer flex flex-col gap-1"
                >
                  <h4 className="font-bold text-gray-900">{exc.nombre}</h4>
                  <p className="text-xs text-gray-400">{formatDate(exc.fecha_creacion)}</p>
                </div>
                <button
                  onClick={() => onEliminar(exc.id, exc.nombre)}
                  title="Eliminar tanda"
                  className="p-2 text-gray-300 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-6 py-4">Nombre</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {excesos.map((exc) => (
                  <tr key={exc.id} className="hover:bg-gray-50/70 transition-colors group">
                    <td className="px-6 py-4 cursor-pointer" onClick={() => onSelectExceso(exc.id)}>
                      <p className="font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">{exc.nombre}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-500 cursor-pointer" onClick={() => onSelectExceso(exc.id)}>
                      {formatDate(exc.fecha_creacion)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEliminar(exc.id, exc.nombre)}
                          title="Eliminar tanda completa"
                          className="p-1.5 text-gray-300 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                        <ChevronRight
                          onClick={() => onSelectExceso(exc.id)}
                          className="text-gray-400 group-hover:text-emerald-600 transition-colors cursor-pointer"
                          size={20}
                        />
                      </div>
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
