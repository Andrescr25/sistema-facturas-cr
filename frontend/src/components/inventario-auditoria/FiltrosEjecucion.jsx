import { Search } from 'lucide-react'

/**
 * Buscador y filtros de estado de la hoja de conteo (todos/pendiente/
 * correcto/descuadre), solo visible durante la ejecución activa. Extraído
 * de InventarioAuditoria.jsx.
 */
export default function FiltrosEjecucion({ executionSearch, setExecutionSearch, executionFilter, setExecutionFilter, itemsStats }) {
  return (
    <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
      {/* Search bar */}
      <div className="relative flex-1">
        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
          <Search size={18} />
        </span>
        <input
          type="text"
          value={executionSearch}
          onChange={(e) => setExecutionSearch(e.target.value)}
          placeholder="Buscar producto por nombre o referencia..."
          className="input w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 focus:border-emerald-500 rounded-xl text-base"
        />
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setExecutionFilter('todos')}
          className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${executionFilter === 'todos'
              ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
        >
          Todos ({itemsStats.total})
        </button>
        <button
          onClick={() => setExecutionFilter('pendiente')}
          className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${executionFilter === 'pendiente'
              ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
        >
          Pendientes ({itemsStats.pendientes})
        </button>
        <button
          onClick={() => setExecutionFilter('correcto')}
          className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${executionFilter === 'correcto'
              ? 'bg-green-600 border-green-600 text-white shadow-sm'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
        >
          Coincide ({itemsStats.correctos})
        </button>
        <button
          onClick={() => setExecutionFilter('descuadre')}
          className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${executionFilter === 'descuadre'
              ? 'bg-red-600 border-red-600 text-white shadow-sm'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
        >
          Descuadre ({itemsStats.descuadres})
        </button>
      </div>
    </div>
  )
}
