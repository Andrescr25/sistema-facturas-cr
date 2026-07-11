import { Search, Filter } from 'lucide-react'

/**
 * Panel de filtros (proveedor + búsqueda por texto) de la gestión de
 * relaciones. Extraído de GestionarRelaciones.jsx.
 */
export default function FiltrosRelaciones({ filtroProveedor, setFiltroProveedor, busqueda, setBusqueda, proveedores, onBuscar, onLimpiar }) {
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
        <Filter className="text-gray-500" size={18} />
        <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Filtros</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Proveedor</label>
          <select
            value={filtroProveedor}
            onChange={(e) => setFiltroProveedor(e.target.value)}
            className="input w-full rounded-xl border-gray-200 text-sm"
          >
            <option value="">Todos los proveedores</option>
            {proveedores.map(p => (
              <option key={p.cedula} value={p.nombre}>{p.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Buscar por descripción o código</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Escribe descripción o código..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="input pl-10 w-full rounded-xl border-gray-200 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={onBuscar} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-sm active:scale-[0.98] transition">
          Buscar
        </button>
        <button onClick={onLimpiar} className="px-5 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-sm transition">
          Limpiar
        </button>
      </div>
    </div>
  )
}
