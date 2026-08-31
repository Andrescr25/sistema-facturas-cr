import { ImageIcon } from 'lucide-react'
import { formatCurrency, clasificarItemConteo } from '../../utils/inventarioAuditoriaUtils'

const ESTADO_CONFIG = {
  ajustado: {
    cardBorder: 'border-exito-300 bg-exito-50/10',
    badge: (diff) => (
      <span className="bg-exito-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase">Ajustado ({diff > 0 ? '+' : ''}{diff})</span>
    ),
    financial: () => <span className="text-xs font-extrabold text-exito-600 shrink-0">Sincronizado</span>
  },
  pendiente: {
    cardBorder: 'border-neutro-100 hover:border-neutro-200',
    badge: () => <span className="bg-neutro-100 text-neutro-500 text-xs font-bold px-2 py-0.5 rounded-md uppercase">Pendiente</span>,
    financial: () => null
  },
  coincide: {
    cardBorder: 'border-exito-300 bg-exito-50/20',
    badge: () => <span className="bg-exito-200 text-exito-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Coincide</span>,
    financial: () => null
  },
  falta: {
    cardBorder: 'border-peligro-300 bg-peligro-50/20',
    badge: (diff) => <span className="bg-peligro-200 text-peligro-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Falta ({diff})</span>,
    financial: (diffCost) => <span className="text-xs font-bold text-peligro-600 shrink-0">{formatCurrency(diffCost)}</span>
  },
  sobra: {
    cardBorder: 'border-primario-300 bg-primario-50/20',
    badge: (diff) => <span className="bg-primario-200 text-primario-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Sobra (+{diff})</span>,
    financial: (diffCost) => <span className="text-xs font-bold text-primario-600 shrink-0">+{formatCurrency(diffCost)}</span>
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
  // Mismo respaldo que ItemExcesoCard: un estado no contemplado no debe
  // tumbar la pantalla.
  const config = ESTADO_CONFIG[estado] || ESTADO_CONFIG.pendiente

  return (
    <div className={`bg-white p-4 rounded-3xl border shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${config.cardBorder}`}>
      <div className="space-y-1 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-bold text-neutro-900 leading-snug">{item.nombre_producto}</h4>
          <button
            type="button"
            onClick={() => onVerImagen(item)}
            aria-label={`Ver foto de ${item.nombre_producto}`}
            className="p-1.5 text-neutro-400 hover:text-exito-600 hover:bg-exito-50 rounded-lg transition-colors shrink-0"
          >
            <ImageIcon size={16} />
          </button>
          {config.badge(diff)}
        </div>
        <p className="text-xs text-neutro-400">
          Ref: <strong className="text-neutro-600 font-semibold">{item.referencia || 'N/A'}</strong>
          {item.category && ` • Cat: ${item.category}`}
        </p>
      </div>

      {/* Stock Comparison area */}
      <div className="flex items-center justify-between sm:justify-end gap-3 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutro-200 shrink-0 w-full sm:w-auto">
        {/* Cost impact */}
        <div className="flex items-center">
          {config.financial(diffCost)}
        </div>

        <div className="flex items-center gap-3">
          {/* Expected stock */}
          <div className="text-center bg-neutro-50 px-3 py-1.5 rounded-2xl border border-neutro-200 min-w-[70px]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutro-400 block">Sistema</span>
            <span className="text-sm font-extrabold text-neutro-700">{stockSis}</span>
          </div>

          {/* Input stock real */}
          <div className="text-center min-w-[90px]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-exito-600 block mb-0.5">Conteo Real</span>
            <input
              type="number"
              value={conteoRaw}
              min="0"
              step="1"
              disabled={item.ajustado_alegra}
              onChange={(e) => onConteoChange(item.id, e.target.value)}
              placeholder="Cantidad"
              className="w-20 text-center py-1 px-2 border-2 border-neutro-300 focus:border-primario-500 rounded-xl font-extrabold text-sm focus:outline-none bg-white disabled:bg-neutro-100 disabled:text-neutro-500"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
