import { useState } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, HelpCircle } from 'lucide-react'
import { formatCurrency, formatFecha } from '../../utils/reporteContadorUtils'
import FilaLinea from './FilaLinea'

/**
 * Una factura con sus líneas colapsadas por defecto. El checkbox "incluir"
 * excluye/incluye TODAS sus líneas de golpe — es la acción principal para
 * resolver un duplicado. Editar o borrar una línea puntual está adentro,
 * expandiendo la factura.
 */
export default function FilaFactura({ factura, onToggle, onEditarLinea, onEliminarLinea }) {
  const [abierta, setAbierta] = useState(false)

  const totalBase = factura.lineas.filter(l => !l.excluido).reduce((s, l) => s + l.baseGravable, 0)
  const totalImpuesto = factura.lineas.filter(l => !l.excluido).reduce((s, l) => s + l.impuesto, 0)

  const badge = factura.duplicadoConfianza === 'alta'
    ? { icon: AlertTriangle, texto: 'Posible duplicado', clase: 'bg-red-100 text-red-700' }
    : factura.duplicadoConfianza === 'media'
      ? { icon: HelpCircle, texto: 'Revisar (mismo monto)', clase: 'bg-amber-100 text-amber-700' }
      : null

  return (
    <div className={`border-b border-gray-100 last:border-0 ${factura.excluida ? 'bg-gray-50/60' : ''}`}>
      <div className="px-4 py-2.5 flex items-center gap-3">
        <button onClick={() => setAbierta(v => !v)} className="text-gray-400 hover:text-gray-700 shrink-0">
          {abierta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <label className="flex items-center gap-2 shrink-0" title="Incluir en los totales">
          <input
            type="checkbox"
            checked={!factura.excluida}
            onChange={() => onToggle(factura.numero, factura.excluida)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-medium ${factura.excluida ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
              {factura.numero}
            </span>
            {/* Las notas de crédito restan, así que se marcan aparte: verlas
                con la insignia "Emitida" y un monto negativo confundía. */}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
              factura.esNotaCredito ? 'bg-purple-100 text-purple-700'
                : factura.esEmitida ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {factura.esNotaCredito ? 'Nota de crédito' : factura.esEmitida ? 'Emitida' : 'Sin emisión'}
            </span>
            {badge && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${badge.clase}`}>
                <badge.icon size={10} /> {badge.texto}
                {factura.duplicadoDe && <span className="font-normal opacity-70">· {factura.duplicadoDe}</span>}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">
            {factura.contraparte} · {formatFecha(factura.fecha)}
            {/* En una nota de crédito lo primero que se quiere saber es a qué
                factura rectifica. */}
            {factura.documentoAsociado && <> · rectifica <span className="text-purple-600">{factura.documentoAsociado}</span></>}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className={`text-sm font-semibold ${factura.excluida ? 'text-gray-400' : 'text-gray-900'}`}>{formatCurrency(totalBase)}</p>
          <p className="text-[11px] text-gray-400">IVA {formatCurrency(totalImpuesto)}</p>
        </div>
      </div>

      {abierta && (
        <div className="px-4 pb-3 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase">
                <th className="px-3 py-1 text-left">Concepto</th>
                <th className="px-3 py-1 text-right">Cant.</th>
                <th className="px-3 py-1 text-right">Precio total</th>
                <th className="px-3 py-1 text-right">Base gravable</th>
                <th className="px-3 py-1 text-right">Impuesto</th>
                <th className="px-3 py-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {factura.lineas.map(l => (
                <FilaLinea key={l.id} linea={l} onEditar={onEditarLinea} onEliminar={onEliminarLinea} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
