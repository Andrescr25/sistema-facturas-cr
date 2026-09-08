import { Filter, RefreshCw, Search, X } from 'lucide-react'

/**
 * La barra de filtros de los dos módulos de pagos.
 *
 * DE DÓNDE SALE CADA PARTE
 * La tarjeta con su encabezado "Filtros" y el botón de actualizar a la
 * derecha son de Cuentas por Cobrar, que es el diseño que se quiso para
 * los dos. Los chips de estado son de Pagos a Proveedores, que ya había
 * resuelto ahí un problema concreto: cobrar tenía el estado en un
 * desplegable Y "Solo vencidas" repetido dentro del filtro de fechas, o sea
 * dos caminos al mismo resultado. Un control por dimensión, y los estados a
 * la vista.
 *
 * `extras` es para lo que solo tiene un módulo — hoy, el desplegable de
 * proveedor.
 */
export default function FiltrosPagos({
  estados, filtros, setFiltros, vencimientos,
  placeholderBusqueda, onLimpiar, hayFiltrosActivos,
  onActualizar, actualizando, textoActualizar = 'Actualizar desde Alegra',
  extras
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-neutro-600">
          <Filter size={16} />
          <span className="font-medium text-sm">Filtros</span>
        </div>
        {onActualizar && (
          <button
            onClick={onActualizar}
            disabled={actualizando}
            className="btn btn-outline text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={14} className={actualizando ? 'animate-spin' : ''} />
            {actualizando ? 'Actualizando...' : textoActualizar}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {estados.map((estado) => (
          <button
            key={estado.value}
            onClick={() => setFiltros((prev) => ({ ...prev, estado: estado.value }))}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition ${
              filtros.estado === estado.value
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
            /* type="text", no "search": Chrome le agrega su propia X y
               quedarían dos. */
            type="text"
            inputMode="search"
            className="input pl-9 w-full"
            placeholder={placeholderBusqueda}
            value={filtros.search}
            onChange={(e) => setFiltros((prev) => ({ ...prev, search: e.target.value }))}
          />
        </div>

        <select
          className="input sm:w-52"
          value={filtros.dias}
          onChange={(e) => setFiltros((prev) => ({ ...prev, dias: e.target.value }))}
        >
          {vencimientos.map((opcion) => (
            <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
          ))}
        </select>

        {extras}

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

/** Los vencimientos son los mismos para cobrar y para pagar. */
export const VENCIMIENTOS = [
  { value: 'todos', label: 'Cualquier vencimiento' },
  { value: 'vence7', label: 'Vence en 7 días' },
  { value: 'vence15', label: 'Vence en 15 días' },
  { value: 'vence30', label: 'Vence en 30 días' }
]
