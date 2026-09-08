import { RefreshCw, PackageX, ChevronRight, Zap, Loader2, Plus, Trash2 } from 'lucide-react'
import { formatDate } from '../../utils/inventarioAuditoriaUtils'

/**
 * Lista de tandas de excesos. Todas las crea una persona: con "Generar
 * Ahora", que trae los productos detectados, o con "Nueva tanda", que la
 * deja vacía para elegirlos a mano. Una vez creadas son iguales — se empacan
 * con la misma pantalla y se les pueden agregar o quitar productos.
 *
 * El domingo ya no aparece ninguna sola. El sistema sigue revisando cada
 * semana —sube los descuentos de lo que no se mueve y saca de liquidación lo
 * que se agotó— pero la tanda de empaque espera a que alguien la pida.
 */
export default function HistorialExcesos({
  excesos, loading, generando, creando,
  onRefresh, onGenerarAhora, onSelectExceso, onCrearManual, onEliminar
}) {
  return (
    <div className="bg-white rounded-3xl border border-neutro-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-neutro-100 flex justify-between items-center bg-neutro-50/50">
        <h2 className="text-xl font-bold text-neutro-900">Excesos de Inventario</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onCrearManual}
            disabled={creando}
            title="Crear una tanda vacía y elegir los productos a mano"
            className="bg-white border border-exito-200 hover:bg-exito-50 disabled:opacity-50 text-exito-700 text-xs font-bold py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5"
          >
            {creando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Nueva tanda
          </button>
          <button
            onClick={onGenerarAhora}
            disabled={generando}
            className="bg-primario-800 hover:bg-primario-900 disabled:bg-neutro-200 text-white text-xs font-bold py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5"
          >
            {generando ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {generando ? 'Generando...' : 'Generar Ahora'}
          </button>
          <button
            onClick={onRefresh}
            className="p-2 text-neutro-400 hover:text-exito-600 transition-colors"
            title="Recargar"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-exito-600' : ''} />
          </button>
        </div>
      </div>

      <div className="px-6 py-3 bg-alerta-50 border-b border-alerta-100 text-xs text-alerta-800">
        Las tandas no se crean solas. Con <strong>Generar Ahora</strong> se arma una con hasta 10 productos
        que tengan stock y no se vendan hace 60 días; con <strong>Nueva tanda</strong>, una vacía para elegirlos a mano.
        Cada domingo el sistema sí revisa por su cuenta: sube el descuento de lo que sigue sin venderse,
        y todos los días saca de liquidación lo que se haya agotado.
      </div>

      {loading && excesos.length === 0 ? (
        <div className="p-12 text-center text-neutro-400 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="animate-spin text-exito-600" size={32} />
          <span>Cargando excesos...</span>
        </div>
      ) : excesos.length === 0 ? (
        <div className="p-12 text-center text-neutro-400 flex flex-col items-center justify-center gap-4">
          <PackageX size={48} className="text-neutro-300" />
          <div>
            <p className="text-lg font-bold text-neutro-700">Todavía no hay reportes de excesos</p>
            <p className="text-sm text-neutro-500 mt-1">Presioná "Generar Ahora" para armar una con lo detectado, o "Nueva tanda" para elegir los productos vos.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Card List */}
          <div className="block sm:hidden divide-y divide-neutro-100">
            {excesos.map((exc) => (
              <div key={exc.id} className="p-4 flex items-center gap-3">
                <div
                  onClick={() => onSelectExceso(exc.id)}
                  className="flex-1 active:bg-neutro-50 cursor-pointer flex flex-col gap-1"
                >
                  <h4 className="font-bold text-neutro-900">{exc.nombre}</h4>
                  <p className="text-xs text-neutro-400">{formatDate(exc.fecha_creacion)}</p>
                </div>
                <button
                  onClick={() => onEliminar(exc.id, exc.nombre)}
                  title="Eliminar tanda"
                  className="p-2 text-neutro-300 hover:text-peligro-600 transition-colors"
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
                <tr className="bg-neutro-50 text-xs font-bold text-neutro-400 uppercase tracking-wider border-b border-neutro-100">
                  <th className="px-6 py-4">Nombre</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutro-100 text-sm">
                {excesos.map((exc) => (
                  <tr key={exc.id} className="hover:bg-neutro-50/70 transition-colors group">
                    <td className="px-6 py-4 cursor-pointer" onClick={() => onSelectExceso(exc.id)}>
                      <p className="font-bold text-neutro-900 group-hover:text-exito-700 transition-colors">{exc.nombre}</p>
                    </td>
                    <td className="px-6 py-4 text-neutro-500 cursor-pointer" onClick={() => onSelectExceso(exc.id)}>
                      {formatDate(exc.fecha_creacion)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEliminar(exc.id, exc.nombre)}
                          title="Eliminar tanda completa"
                          className="p-1.5 text-neutro-300 hover:text-peligro-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                        <ChevronRight
                          onClick={() => onSelectExceso(exc.id)}
                          className="text-neutro-400 group-hover:text-exito-600 transition-colors cursor-pointer"
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
