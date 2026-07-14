/**
 * Filtro segmentado de 3 estados (todos/relacionados/sin relacionar).
 * Extraído de RelacionarProductos.jsx.
 */
export default function FiltrosSegmentados({ filtro, setFiltro, stats }) {
  return (
    <div className="flex bg-gray-100 p-1 rounded-2xl max-w-md gap-1 mb-6">
      <button
        onClick={() => setFiltro('todos')}
        className={`flex-1 text-center py-2 text-xs font-bold rounded-xl transition-all ${
          filtro === 'todos'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-900'
        }`}
      >
        Todos ({stats.total})
      </button>
      <button
        onClick={() => setFiltro('relacionados')}
        className={`flex-1 text-center py-2 text-xs font-bold rounded-xl transition-all ${
          filtro === 'relacionados'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-900'
        }`}
      >
        Relacionados ({stats.relacionados})
      </button>
      <button
        onClick={() => setFiltro('no-relacionados')}
        className={`flex-1 text-center py-2 text-xs font-bold rounded-xl transition-all ${
          filtro === 'no-relacionados'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-900'
        }`}
      >
        Sin Relacionar ({stats.noRelacionados})
      </button>
    </div>
  )
}
