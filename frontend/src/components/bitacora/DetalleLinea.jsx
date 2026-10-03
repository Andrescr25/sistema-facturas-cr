import { ArrowLeft, Loader2 } from 'lucide-react'
import { fechaHora, nombreDeCampo, tonoDeAccion, valorLegible } from '../../utils/bitacoraFormato'

/**
 * Una línea abierta: qué cambió, campo por campo, con el valor de antes y el
 * de después lado a lado.
 */
export default function DetalleLinea({ linea, detalle, cargando, onVolver }) {
  const cambios = detalle?.cambios || []

  return (
    <div>
      <button type="button" onClick={onVolver} className="mb-4 flex items-center gap-1.5 text-sm font-bold text-primario-600 hover:text-primario-800">
        <ArrowLeft size={16} />
        Volver a la bitácora
      </button>

      <div className="rounded-2xl border border-neutro-100 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase ${tonoDeAccion(linea.accion)}`}>
            {linea.accionVerbo}
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-neutro-400">{linea.entidadNombre}</span>
        </div>
        <h2 className="mt-2 text-xl font-extrabold text-neutro-900">{(detalle || linea).titulo || `#${linea.entidadId}`}</h2>
        <p className="mt-1 text-sm text-neutro-600">
          {linea.usuarioNombre} · {fechaHora(linea.cuando)} · registro #{linea.entidadId}
        </p>
        {linea.motivo && (
          <p className="mt-3 rounded-xl bg-neutro-50 px-3 py-2 text-sm text-neutro-700">
            <span className="font-bold">Motivo:</span> {linea.motivo}
          </p>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-neutro-100 bg-white">
        <div className="border-b border-neutro-100 px-5 py-3">
          <h3 className="text-sm font-extrabold text-neutro-900">
            {cargando ? 'Leyendo lo que cambió…' : `${cambios.length} campo${cambios.length === 1 ? '' : 's'}`}
          </h3>
        </div>

        {cargando ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-primario-600" /></div>
        ) : cambios.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutro-500">Esta línea no guardó el detalle de los campos.</p>
        ) : (
          <div className="divide-y divide-neutro-100">
            {cambios.map(c => (
              <div key={c.campo} className="grid gap-1 px-5 py-3 sm:grid-cols-3 sm:gap-4">
                <p className="text-sm font-bold text-neutro-800">{nombreDeCampo(c.campo)}</p>
                <p className="min-w-0 break-words text-sm text-neutro-500">
                  <span className="mr-1 text-[11px] font-bold uppercase text-neutro-400 sm:hidden">Antes</span>
                  {valorLegible(c.antes)}
                </p>
                <p className="min-w-0 break-words text-sm font-semibold text-neutro-900">
                  <span className="mr-1 text-[11px] font-bold uppercase text-neutro-400 sm:hidden">Después</span>
                  {valorLegible(c.despues)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
