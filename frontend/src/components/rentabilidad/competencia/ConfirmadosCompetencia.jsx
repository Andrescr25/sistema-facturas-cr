import { Loader2, ShieldCheck, ExternalLink, ArrowRight } from 'lucide-react'
import ImagenProducto from './ImagenProducto'
import { formatCurrency } from '../../../utils/rentabilidadUtils'
import { fuenteLabel, fuenteEstilo } from '../../../utils/competenciaUtils'

// Espejo de MARGEN_PULPERIA_ASUMIDO (backend/src/modules/precios/motor.js).
const MARGEN_PULPERIA_ASUMIDO = 20

/**
 * Emparejamientos ya confirmados: son los que alimentan el techo de precio
 * de la pestaña Catálogo. Se muestran con las dos fotos para que un error
 * de emparejamiento viejo salte a la vista sin tener que ir a la base.
 */
export default function ConfirmadosCompetencia({ confirmados, loading }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          Confirmados {confirmados.length > 0 && <span className="text-gray-400 font-normal">({confirmados.length})</span>}
          {loading && <Loader2 size={16} className="animate-spin text-purple-500" />}
        </h2>
        <p className="text-xs text-gray-500">Estos son los que fijan el techo de precio en la pestaña Catálogo.</p>
      </div>

      {!loading && confirmados.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 flex flex-col items-center gap-3">
          <ShieldCheck size={40} className="text-gray-300" />
          <p>Todavía no confirmaste ningún emparejamiento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {confirmados.map((m) => {
            const techo = m.precio > 0 ? m.precio / (1 + MARGEN_PULPERIA_ASUMIDO / 100) : null
            const supera = techo !== null && m.precioPropio > techo
            return (
              <div key={`${m.fuente}::${m.skuExterno}`} className="card !p-3 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <ImagenProducto src={m.imagenPropia} alt={m.nombrePropio} tamano="h-14 w-14" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate" title={m.nombrePropio}>{m.nombrePropio}</p>
                    <p className="text-xs text-gray-500">
                      {m.categoria} · {m.precioPropio > 0 ? formatCurrency(m.precioPropio) : 'sin precio'}
                    </p>
                  </div>

                  <ArrowRight size={16} className="text-gray-300 shrink-0" />

                  <ImagenProducto src={m.imagenUrl} alt={m.nombreExterno} tamano="h-14 w-14" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${fuenteEstilo(m.fuente)}`}>
                        {fuenteLabel(m.fuente)}
                      </span>
                      {m.urlProducto && (
                        <a href={m.urlProducto} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600">
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 truncate" title={m.nombreExterno}>{m.nombreExterno}</p>
                    <p className="text-xs font-semibold text-gray-800">{m.precio !== null ? formatCurrency(m.precio) : '—'}</p>
                  </div>
                </div>

                {techo !== null && (
                  <div className={`text-[11px] rounded-lg px-2.5 py-1.5 ${supera ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'}`}>
                    Techo <strong>{formatCurrency(techo)}</strong>
                    {supera && ' · mi precio lo supera'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
