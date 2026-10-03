import { ChevronRight } from 'lucide-react'
import { fechaHora, tonoDeAccion } from '../../utils/bitacoraFormato'

/**
 * Una línea de la bitácora en la lista: quién, qué hizo, sobre qué y cuándo.
 * Tarjeta grande y entera tocable, como las de Cuentas por Cobrar.
 */
export default function TarjetaLinea({ linea, onAbrir }) {
  return (
    <button
      type="button"
      onClick={() => onAbrir(linea)}
      className="w-full rounded-2xl border border-neutro-100 bg-white p-4 text-left transition-colors hover:border-primario-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase ${tonoDeAccion(linea.accion)}`}>
              {linea.accionVerbo}
            </span>
            <span className="text-xs font-bold uppercase tracking-wide text-neutro-400">{linea.entidadNombre}</span>
          </div>
          <p className="mt-1.5 truncate text-base font-bold text-neutro-900">
            {linea.titulo || `#${linea.entidadId}`}
          </p>
          <p className="mt-0.5 text-sm text-neutro-600">
            {linea.usuarioNombre}
            {linea.camposCambiados > 0 && (
              <span className="text-neutro-400"> · {linea.camposCambiados} campo{linea.camposCambiados === 1 ? '' : 's'}</span>
            )}
          </p>
          {linea.motivo && <p className="mt-1 truncate text-sm text-neutro-500">“{linea.motivo}”</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-right text-xs font-semibold text-neutro-500">{fechaHora(linea.cuando)}</p>
          <ChevronRight size={18} className="text-neutro-300" />
        </div>
      </div>
    </button>
  )
}
