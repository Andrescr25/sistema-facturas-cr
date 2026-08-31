import { Check, X, Loader2, ExternalLink } from 'lucide-react'
import ImagenProducto from './ImagenProducto'
import { formatCurrency } from '../../../utils/rentabilidadUtils'
import { fuenteLabel, fuenteEstilo, estiloScore } from '../../../utils/competenciaUtils'

// Mismo supuesto que backend/src/modules/precios/motor.js
// (MARGEN_PULPERIA_ASUMIDO). Se muestra acá solo como anticipo de lo que
// implicaría confirmar; el techo real lo calcula el backend.
const MARGEN_PULPERIA_ASUMIDO = 20

/**
 * Un par "mi producto ↔ producto de la competencia" puesto lado a lado con
 * las dos fotos, para decidir de un vistazo si son el mismo.
 *
 * El score por sí solo no alcanzaba: contra datos reales hubo pares al 100%
 * que eran cosas distintas ("TOALLA P/ MANOS 180 MTS" con "Porta toallas de
 * manos" — el rollo contra el dispensador). Con las dos fotos la decisión
 * es inmediata, que es exactamente para lo que sirve una persona acá.
 */
export default function TarjetaComparacion({ sugerencia, ocupado, onConfirmar, onRechazar }) {
  const { sugerido } = sugerencia
  const techo = sugerencia.precio > 0 ? sugerencia.precio / (1 + MARGEN_PULPERIA_ASUMIDO / 100) : null
  const precioPropio = sugerido.precio || 0
  const superaTecho = techo !== null && precioPropio > techo

  return (
    <div className="border border-neutro-200 rounded-2xl bg-white overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-neutro-100 bg-neutro-50/70">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${fuenteEstilo(sugerencia.fuente)}`}>
          {fuenteLabel(sugerencia.fuente)}
        </span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${estiloScore(sugerido.score)}`}>
          {sugerido.score}% parecido
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-neutro-100">
        <div className="p-3 flex flex-col items-center text-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutro-400">Mi producto</span>
          <ImagenProducto src={sugerido.imagenUrl} alt={sugerido.nombre} />
          <p className="text-xs font-medium text-neutro-800 leading-snug line-clamp-2" title={sugerido.nombre}>
            {sugerido.nombre}
          </p>
          {sugerido.categoria && <p className="text-[10px] text-neutro-400">{sugerido.categoria}</p>}
          <p className="text-sm font-semibold text-neutro-900 mt-auto">
            {precioPropio > 0 ? formatCurrency(precioPropio) : '—'}
          </p>
        </div>

        <div className="p-3 flex flex-col items-center text-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutro-400">Competencia</span>
          <ImagenProducto src={sugerencia.imagenUrl} alt={sugerencia.nombreExterno} />
          <p className="text-xs font-medium text-neutro-800 leading-snug line-clamp-2" title={sugerencia.nombreExterno}>
            {sugerencia.nombreExterno}
          </p>
          {sugerencia.urlProducto ? (
            <a
              href={sugerencia.urlProducto}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primario-600 hover:underline flex items-center gap-0.5"
            >
              ver ficha <ExternalLink size={9} />
            </a>
          ) : (
            <span className="text-[10px] text-neutro-300">sin ficha</span>
          )}
          <p className="text-sm font-semibold text-neutro-900 mt-auto">{formatCurrency(sugerencia.precio)}</p>
        </div>
      </div>

      {techo !== null && (
        <div className={`px-4 py-2 text-[11px] border-t ${superaTecho ? 'bg-peligro-50 border-peligro-100 text-peligro-700' : 'bg-primario-50/60 border-primario-100 text-primario-800'}`}>
          Si es el mismo, mi techo sería <strong>{formatCurrency(techo)}</strong>
          {precioPropio > 0 && (
            superaTecho
              ? <> — hoy vendo {formatCurrency(precioPropio)}, <strong>por encima del techo</strong></>
              : <> — hoy vendo {formatCurrency(precioPropio)}, debajo del techo</>
          )}
        </div>
      )}

      <div className="p-3 flex gap-2 border-t border-neutro-100 mt-auto">
        <button
          onClick={() => onConfirmar(sugerencia)}
          disabled={ocupado}
          className="btn btn-primary !py-2 flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Es el mismo
        </button>
        <button
          onClick={() => onRechazar(sugerencia)}
          disabled={ocupado}
          title="No es el mismo producto — no vuelve a aparecer"
          className="btn btn-outline !py-2 !px-3 flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <X size={14} /> No
        </button>
      </div>
    </div>
  )
}
