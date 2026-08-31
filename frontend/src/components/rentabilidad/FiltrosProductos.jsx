import { Search, X } from 'lucide-react'
import { CLASIFICACION_INFO, claseRotacionLabel } from '../../utils/rentabilidadUtils'

export default function FiltrosProductos({ filtros, setFiltros, resetFiltros, categorias }) {
  const hayFiltrosActivos = filtros.categoria !== 'todas' || filtros.clasificacion !== 'todas' || filtros.clase !== 'todas' || filtros.search || filtros.superaTecho

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
          <input
            type="text"
            className="input pl-9 w-full"
            placeholder="Buscar producto por nombre..."
            value={filtros.search}
            onChange={(e) => setFiltros({ search: e.target.value })}
          />
        </div>

        <select
          className="input sm:w-56"
          value={filtros.categoria}
          onChange={(e) => setFiltros({ categoria: e.target.value })}
        >
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.categoria} value={c.categoria}>{c.categoria} ({c.total})</option>
          ))}
        </select>

        <select
          className="input sm:w-52"
          value={filtros.clasificacion}
          onChange={(e) => setFiltros({ clasificacion: e.target.value })}
        >
          <option value="todas">Toda calidad de costo</option>
          {Object.entries(CLASIFICACION_INFO).map(([key, info]) => (
            <option key={key} value={key}>{info.label}</option>
          ))}
        </select>

        <select
          className="input sm:w-44"
          value={filtros.clase}
          onChange={(e) => setFiltros({ clase: e.target.value })}
        >
          <option value="todas">Todo peso en ventas</option>
          <option value="A">{claseRotacionLabel('A')}</option>
          <option value="B">{claseRotacionLabel('B')}</option>
          <option value="C">{claseRotacionLabel('C')}</option>
        </select>

        {hayFiltrosActivos && (
          <button onClick={resetFiltros} className="btn btn-outline flex items-center gap-1.5 whitespace-nowrap">
            <X size={14} /> Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
