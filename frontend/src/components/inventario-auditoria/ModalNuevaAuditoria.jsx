import { Play, X, Info, RefreshCw } from 'lucide-react'

/**
 * Modal para iniciar una nueva sesión de auditoría (aleatoria, por
 * categoría, o productos críticos). Extraído de InventarioAuditoria.jsx.
 */
export default function ModalNuevaAuditoria({
  loading,
  newAuditNombre,
  setNewAuditNombre,
  newAuditTipo,
  setNewAuditTipo,
  newAuditCategoria,
  setNewAuditCategoria,
  categorias,
  onSubmit,
  onCerrar
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onCerrar} />

      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-6 transform transition-all border border-gray-150">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Play className="text-emerald-600 fill-emerald-600" size={20} />
            Nueva Auditoría
          </h3>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Nombre de la sesión */}
          <div>
            <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">Nombre (Opcional)</label>
            <input
              type="text"
              value={newAuditNombre}
              onChange={(e) => setNewAuditNombre(e.target.value)}
              className="input w-full py-2.5 px-3 border-2 border-gray-300 focus:border-emerald-500 rounded-xl text-base"
            />
          </div>

          {/* Tipo de Auditoría */}
          <div>
            <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">Estrategia de Selección</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setNewAuditTipo('random')}
                className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 justify-center transition-all ${newAuditTipo === 'random'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
              >
                <span className="text-xs font-bold uppercase tracking-wide">Random 50</span>
              </button>

              <button
                type="button"
                onClick={() => setNewAuditTipo('categoria')}
                className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 justify-center transition-all ${newAuditTipo === 'categoria'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
              >
                <span className="text-xs font-bold uppercase tracking-wide">Categoría</span>
              </button>

              <button
                type="button"
                onClick={() => setNewAuditTipo('critico')}
                className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 justify-center transition-all ${newAuditTipo === 'critico'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
              >
                <span className="text-xs font-bold uppercase tracking-wide">Críticos 30</span>
              </button>
            </div>
          </div>

          {/* Category selector (condicional) */}
          {newAuditTipo === 'categoria' && (
            <div>
              <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">Seleccionar Categoría</label>
              <select
                value={newAuditCategoria}
                onChange={(e) => setNewAuditCategoria(e.target.value)}
                className="select w-full py-2.5 px-3 border-2 border-gray-300 focus:border-emerald-500 rounded-xl text-base bg-white"
              >
                {categorias.map((cat, idx) => (
                  <option key={idx} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}

          {/* Info Note */}
          <div className="bg-emerald-50 text-emerald-900 border border-emerald-150 p-3.5 rounded-2xl text-xs leading-relaxed flex items-start gap-2.5">
            <Info size={16} className="text-emerald-700 shrink-0 mt-0.5" />
            <p>
              {newAuditTipo === 'random' && 'El sistema elegirá al azar 50 productos activos de la distribuidora para auditar su existencia.'}
              {newAuditTipo === 'categoria' && 'Se auditarán todos los productos clasificados bajo la categoría seleccionada.'}
              {newAuditTipo === 'critico' && 'Se auditarán los 30 productos que tienen mayor cantidad de incidencias de faltantes reportados históricamente.'}
            </p>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="animate-spin" size={20} /> : <Play size={20} fill="white" />}
            {loading ? 'Inicializando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
