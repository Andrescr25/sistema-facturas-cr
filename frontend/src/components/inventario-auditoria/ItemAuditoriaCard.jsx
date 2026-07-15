import { ImageIcon } from 'lucide-react'
import { formatCurrency, clasificarItemConteo } from '../../utils/inventarioAuditoriaUtils'

const ESTADO_CONFIG = {
  ajustado: {
    cardBorder: 'border-emerald-300 bg-emerald-50/10',
    badge: (diff) => (
      <span className="bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase">Ajustado ({diff > 0 ? '+' : ''}{diff})</span>
    ),
    financial: () => <span className="text-xs font-extrabold text-emerald-600 shrink-0">Sincronizado</span>
  },
  pendiente: {
    cardBorder: 'border-gray-100 hover:border-gray-200',
    badge: () => <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2 py-0.5 rounded-md uppercase">Pendiente</span>,
    financial: () => null
  },
  coincide: {
    cardBorder: 'border-green-300 bg-green-50/20',
    badge: () => <span className="bg-green-150 text-green-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Coincide</span>,
    financial: () => null
  },
  falta: {
    cardBorder: 'border-red-300 bg-red-50/20',
    badge: (diff) => <span className="bg-red-150 text-red-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Falta ({diff})</span>,
    financial: (diffCost) => <span className="text-xs font-bold text-red-600 shrink-0">{formatCurrency(diffCost)}</span>
  },
  sobra: {
    cardBorder: 'border-blue-300 bg-blue-50/20',
    badge: (diff) => <span className="bg-blue-150 text-blue-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Sobra (+{diff})</span>,
    financial: (diffCost) => <span className="text-xs font-bold text-blue-600 shrink-0">+{formatCurrency(diffCost)}</span>
  }
}

/**
 * Tarjeta de un producto en la hoja de conteo físico: estado (pendiente,
 * coincide, falta, sobra, ya ajustado), impacto financiero, y el input de
 * conteo real. Extraído de InventarioAuditoria.jsx (era el cuerpo del .map
 * de items en la hoja de conteo).
 */
export default function ItemAuditoriaCard({ item, conteoRaw, onConteoChange, onVerImagen }) {
  const { estado, stockSis, diff, diffCost } = clasificarItemConteo(item, conteoRaw)
  const config = ESTADO_CONFIG[estado]

  return (
    <div className={`bg-white p-4 rounded-3xl border shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${config.cardBorder}`}>
      <div className="space-y-1 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-bold text-gray-900 leading-snug">{item.nombre_producto}</h4>
          <button
            type="button"
            onClick={() => onVerImagen(item)}
            aria-label={`Ver foto de ${item.nombre_producto}`}
            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors shrink-0"
          >
            <ImageIcon size={16} />
          </button>
          {config.badge(diff)}
        </div>
        <p className="text-xs text-gray-400">
          Ref: <strong className="text-gray-600 font-semibold">{item.referencia || 'N/A'}</strong>
          {item.category && ` • Cat: ${item.category}`}
        </p>
      </div>

      {/* Stock Comparison area */}
      <div className="flex items-center justify-between sm:justify-end gap-3 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-150 shrink-0 w-full sm:w-auto">
        {/* Cost impact */}
        <div className="flex items-center">
          {config.financial(diffCost)}
        </div>

        <div className="flex items-center gap-3">
          {/* Expected stock */}
          <div className="text-center bg-gray-50 px-3 py-1.5 rounded-2xl border border-gray-150 min-w-[70px]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block">Sistema</span>
            <span className="text-sm font-extrabold text-gray-700">{stockSis}</span>
          </div>

          {/* Input stock real */}
          <div className="text-center min-w-[90px]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 block mb-0.5">Conteo Real</span>
            <input
              type="number"
              value={conteoRaw}
              min="0"
              step="1"
              disabled={item.ajustado_alegra}
              onChange={(e) => onConteoChange(item.id, e.target.value)}
              placeholder="Cantidad"
              className="w-20 text-center py-1 px-2 border-2 border-gray-300 focus:border-emerald-500 rounded-xl font-extrabold text-sm focus:outline-none bg-white disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
