import { Search, X } from 'lucide-react'

/**
 * Filtros de cuentas por pagar: UN control por dimensión.
 *
 * Antes el estado tenía dos controles en la misma tarjeta — un desplegable y
 * una fila de chips con las mismas opciones — así que "Pendientes" aparecía
 * dos veces y no quedaba claro cuál mandaba. El estado son 5 opciones
 * excluyentes: los chips las muestran todas a la vista y se cambian con un
 * click, así que el desplegable sobraba.
 *
 * También se quitó "Solo vencidas" del filtro de fecha: pedía exactamente lo
 * mismo que el chip "Vencidas" pero por otro camino (días restantes < 0 en
 * vez del estado guardado), y dos rutas al mismo resultado es justo lo que
 * confunde.
 */

const ESTADOS = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'vencida', label: 'Vencidas' },
  { value: 'parcial', label: 'En seguimiento' },
  { value: 'pagada', label: 'Pagadas' }
]

const VENCIMIENTOS = [
  { value: 'todos', label: 'Cualquier vencimiento' },
  { value: 'vence7', label: 'Vence en 7 días' },
  { value: 'vence15', label: 'Vence en 15 días' },
  { value: 'vence30', label: 'Vence en 30 días' }
]

export default function FiltrosPagos({ filters, setFilters, proveedoresDisponibles, onLimpiar }) {
  // "Pendientes" es el estado por defecto, así que no cuenta como filtro
  // activo: si contara, el botón de limpiar estaría siempre visible.
  const hayFiltrosActivos =
    filters.estado !== 'pendiente' ||
    filters.dias !== 'todos' ||
    filters.proveedor !== 'todos' ||
    Boolean(filters.search)

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap gap-2">
        {ESTADOS.map((estado) => (
          <button
            key={estado.value}
            onClick={() => setFilters((prev) => ({ ...prev, estado: estado.value }))}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition ${
              filters.estado === estado.value
                ? 'bg-primario-600 text-white border-primario-600'
                : 'border-neutro-200 text-neutro-600 hover:border-primario-400'
            }`}
          >
            {estado.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
          <input
            type="text"
            className="input pl-9 w-full"
            placeholder="Buscar proveedor o factura..."
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
        </div>

        <select
          className="input sm:w-52"
          value={filters.dias}
          onChange={(e) => setFilters((prev) => ({ ...prev, dias: e.target.value }))}
        >
          {VENCIMIENTOS.map((opcion) => (
            <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
          ))}
        </select>

        <select
          className="input sm:w-64"
          value={filters.proveedor}
          onChange={(e) => setFilters((prev) => ({ ...prev, proveedor: e.target.value }))}
        >
          <option value="todos">Todos los proveedores</option>
          {proveedoresDisponibles.map((prov) => (
            <option key={prov.cedula} value={prov.cedula}>{prov.nombre}</option>
          ))}
        </select>

        {hayFiltrosActivos && (
          <button
            onClick={onLimpiar}
            className="btn btn-outline flex items-center gap-1.5 whitespace-nowrap"
          >
            <X size={14} /> Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
