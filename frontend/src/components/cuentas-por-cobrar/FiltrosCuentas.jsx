import { Filter, RefreshCw, Search } from 'lucide-react'

const estadoOptions = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'PENDIENTE', label: 'Pendientes' },
  { value: 'PARCIAL', label: 'Con abono parcial' },
  { value: 'VENCIDA', label: 'Vencidas' }
]

const diasOptions = [
  { value: 'todos', label: 'Cualquier fecha' },
  { value: 'vence7', label: 'Vence en 7 días' },
  { value: 'vence15', label: 'Vence en 15 días' },
  { value: 'vence30', label: 'Vence en 30 días' },
  { value: 'vencidas', label: 'Solo vencidas' }
]

/**
 * Barra de filtros (estado, fecha, búsqueda) + botón de sincronizar con
 * Alegra + limpiar filtros. De pagos-proveedores/FiltrosPagos.jsx.
 */
export default function FiltrosCuentas({ filters, setFilters, onLimpiar, onSincronizar, sincronizando }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-600">
          <Filter size={16} />
          <span className="font-medium text-sm">Filtros</span>
        </div>
        <button
          onClick={onSincronizar}
          disabled={sincronizando}
          className="btn btn-outline text-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={14} className={sincronizando ? 'animate-spin' : ''} />
          {sincronizando ? 'Sincronizando...' : 'Actualizar desde Alegra'}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <select
          className="input"
          value={filters.estado}
          onChange={(e) => setFilters((prev) => ({ ...prev, estado: e.target.value }))}
        >
          {estadoOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          className="input"
          value={filters.dias}
          onChange={(e) => setFilters((prev) => ({ ...prev, dias: e.target.value }))}
        >
          {diasOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Buscar cliente o factura..."
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="px-3 py-1 rounded-full text-sm border border-gray-300 text-gray-600 hover:border-red-400"
          onClick={onLimpiar}
        >
          Limpiar filtros
        </button>
      </div>
    </div>
  )
}
