import { Filter, Search } from 'lucide-react'

const estadoOptions = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'vencida', label: 'Vencidas' },
  { value: 'parcial', label: 'En seguimiento' },
  { value: 'pagada', label: 'Pagadas' }
]

const diasOptions = [
  { value: 'todos', label: 'Cualquier fecha' },
  { value: 'vence7', label: 'Vence en 7 días' },
  { value: 'vence15', label: 'Vence en 15 días' },
  { value: 'vence30', label: 'Vence en 30 días' },
  { value: 'vencidas', label: 'Solo vencidas' }
]

const quickActions = [
  { label: 'Pendientes', value: 'pendiente' },
  { label: 'Vencidas', value: 'vencida' },
  { label: 'En seguimiento', value: 'parcial' },
  { label: 'Pagadas', value: 'pagada' }
]

/**
 * Barra de filtros (estado, fecha, proveedor, búsqueda) + accesos rápidos
 * por estado + botón de limpiar. Extraído de PagosProveedores.jsx.
 */
export default function FiltrosPagos({ filters, setFilters, proveedoresDisponibles, onLimpiar }) {
  const proveedoresOptions = [
    { value: 'todos', label: 'Todos los proveedores' },
    ...proveedoresDisponibles.map((prov) => ({
      value: prov.cedula,
      label: `${prov.nombre} (${prov.cedula})`
    }))
  ]

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 text-gray-600">
        <Filter size={16} />
        <span className="font-medium text-sm">Filtros</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <select
          className="input"
          value={filters.estado}
          onChange={(e) => setFilters((prev) => ({ ...prev, estado: e.target.value }))}
        >
          {estadoOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={filters.dias}
          onChange={(e) => setFilters((prev) => ({ ...prev, dias: e.target.value }))}
        >
          {diasOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={filters.proveedor}
          onChange={(e) => setFilters((prev) => ({ ...prev, proveedor: e.target.value }))}
        >
          {proveedoresOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Buscar proveedor o factura..."
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {quickActions.map((action) => (
          <button
            key={action.value}
            className={`px-3 py-1 rounded-full text-sm border transition ${
              filters.estado === action.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-300 text-gray-600 hover:border-blue-400'
            }`}
            onClick={() => setFilters((prev) => ({ ...prev, estado: action.value }))}
          >
            {action.label}
          </button>
        ))}
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
