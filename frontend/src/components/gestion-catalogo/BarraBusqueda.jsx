import { AlertCircle, Search } from 'lucide-react'

/**
 * Buscar en todo el catálogo (descarta el riel mientras hay término, igual
 * que el catálogo del agente) y el filtro "solo sin imagen" — se aplica
 * sobre lo que ya esté cargado, sea una categoría del riel o el resultado
 * de la búsqueda.
 */
export default function BarraBusqueda({ busqueda, setBusqueda, soloSinImagen, setSoloSinImagen, total }) {
  return (
    <div className="flex flex-col items-stretch gap-3 rounded-xl border border-neutro-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1 sm:min-w-[16rem]">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutro-400">
          <Search size={16} />
        </span>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en todo el catálogo por nombre o referencia…"
          className="w-full rounded-lg border border-neutro-200 bg-neutro-50 py-2 pl-9 pr-3 text-sm text-neutro-900 transition-all focus:border-primario-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primario-500/30"
        />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
        <label className="flex cursor-pointer select-none items-center gap-2">
          <input
            type="checkbox"
            checked={soloSinImagen}
            onChange={(e) => setSoloSinImagen(e.target.checked)}
            className="sr-only peer"
          />
          <div className="relative h-5 w-9 rounded-full bg-neutro-200 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-primario-600 peer-checked:after:translate-x-full" />
          <span className="flex items-center gap-1 text-xs font-semibold text-neutro-600">
            <AlertCircle size={13} className="text-alerta-500" /> Solo sin imagen
          </span>
        </label>

        <span className="whitespace-nowrap text-xs font-medium text-neutro-400">
          <span className="text-sm font-bold text-neutro-700">{total}</span> producto{total === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}
