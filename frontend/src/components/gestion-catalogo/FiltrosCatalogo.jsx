import { Search, AlertCircle } from 'lucide-react'

/**
 * Barra de búsqueda y filtro "solo sin imagen" del catálogo, con el total
 * de productos en base local. Extraído de GestionCatalogo.jsx.
 */
export default function FiltrosCatalogo({ searchQuery, setSearchQuery, missingImageOnly, setMissingImageOnly, totalProductos }) {
  return (
    <div className="bg-white rounded-xl shadow-md p-4 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 border border-neutro-100">
      <div className="relative flex-1">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutro-400">
          <Search className="h-5 w-5" />
        </span>
        <input
          type="text"
          placeholder="Buscar por nombre, código de referencia o descripción..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-neutro-50 border border-neutro-200 rounded-lg text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white transition-all text-sm"
        />
      </div>

      <div className="flex items-center justify-between lg:justify-end gap-6">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={missingImageOnly}
            onChange={(e) => setMissingImageOnly(e.target.checked)}
            className="sr-only peer"
          />
          <div className="relative w-11 h-6 bg-neutro-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primario-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-neutro-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primario-600"></div>
          <span className="text-sm font-semibold text-neutro-700 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-alerta-500" /> Mostrar sólo sin imagen
          </span>
        </label>

        <div className="text-xs text-neutro-400 font-medium">
          Total en base local: <span className="font-bold text-neutro-700 text-sm">{totalProductos}</span>
        </div>
      </div>
    </div>
  )
}
