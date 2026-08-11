import { useState } from 'react'
import { Check, Loader2, Undo2, ImageIcon, Trash2 } from 'lucide-react'
import { formatCurrency, clasificarItemConteo } from '../../utils/inventarioAuditoriaUtils'

// Mismos colores/lenguaje visual que ItemAuditoriaCard.jsx (hoja de conteo de
// auditorías normales), para que "¿coincide o no la cantidad?" se vea igual
// en todo el módulo.
const ESTADO_CONFIG = {
  pendiente: {
    cardBorder: 'border-gray-100',
    badge: () => <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2 py-0.5 rounded-md uppercase">Pendiente</span>,
    boton: { texto: 'Marcar Empacado', clase: 'bg-emerald-600 hover:bg-emerald-700' }
  },
  coincide: {
    cardBorder: 'border-green-300 bg-green-50/20',
    badge: () => <span className="bg-green-150 text-green-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Coincide</span>,
    boton: { texto: 'Marcar Empacado', clase: 'bg-emerald-600 hover:bg-emerald-700' }
  },
  falta: {
    cardBorder: 'border-red-300 bg-red-50/20',
    badge: (diff) => <span className="bg-red-150 text-red-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Falta ({diff})</span>,
    boton: (cantidad) => ({ texto: `Corregir a ${cantidad} y Marcar Empacado`, clase: 'bg-amber-600 hover:bg-amber-700' })
  },
  sobra: {
    cardBorder: 'border-blue-300 bg-blue-50/20',
    badge: (diff) => <span className="bg-blue-150 text-blue-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Sobra (+{diff})</span>,
    boton: (cantidad) => ({ texto: `Corregir a ${cantidad} y Marcar Empacado`, clase: 'bg-amber-600 hover:bg-amber-700' })
  }
}

/**
 * Tarjeta de un producto dentro de la "factura de empaque" de un exceso.
 * El empleado marca "Empacado" directamente, o si la cantidad física no
 * coincide con Alegra, la escribe antes de marcar — eso dispara la
 * corrección real de inventario en Alegra (mismo mecanismo que ya usan las
 * auditorías normales). Un solo click siempre: no hay borrador/guardado por
 * separado como en la hoja de conteo normal, porque empacar debe ser rápido.
 */
export default function ItemExcesoCard({ item, onActualizar, onVerImagen, onEliminar }) {
  const [cantidad, setCantidad] = useState('')
  const [guardando, setGuardando] = useState(false)

  const stockSistema = Number(item.stock_sistema)

  const handleMarcar = async () => {
    setGuardando(true)
    try {
      await onActualizar(item.id, {
        empacado: true,
        ...(cantidad !== '' ? { stockReal: cantidad } : {})
      })
      setCantidad('')
    } finally {
      setGuardando(false)
    }
  }

  const handleDesmarcar = async () => {
    setGuardando(true)
    try {
      await onActualizar(item.id, { empacado: false })
    } finally {
      setGuardando(false)
    }
  }

  if (item.empacado) {
    const fueCorregido = item.ajustado_alegra && item.stock_real !== null && Number(item.stock_real) !== stockSistema
    const valorReal = fueCorregido ? Number(item.stock_real) : stockSistema
    const diff = valorReal - stockSistema

    return (
      <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Check className="text-emerald-600 shrink-0" size={20} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-gray-900 text-sm truncate">{item.nombre_producto}</p>
              <button
                type="button"
                onClick={() => onVerImagen(item)}
                aria-label={`Ver foto de ${item.nombre_producto}`}
                className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors shrink-0"
              >
                <ImageIcon size={14} />
              </button>
              {fueCorregido ? (
                <span className="bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase">
                  Ajustado ({diff > 0 ? '+' : ''}{diff})
                </span>
              ) : (
                <span className="bg-emerald-150 text-emerald-700 text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase">
                  Empacado • Cantidad correcta
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">Ref: {item.referencia || 'N/A'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="text-center bg-gray-50 px-3 py-1.5 rounded-2xl border border-gray-150 min-w-[64px]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block">Sistema</span>
              <span className="text-sm font-extrabold text-gray-700">{stockSistema}</span>
            </div>
            <div className="text-center bg-emerald-50 px-3 py-1.5 rounded-2xl border border-emerald-150 min-w-[64px]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 block">Empacado</span>
              <span className="text-sm font-extrabold text-emerald-700">{valorReal}</span>
            </div>
          </div>
          <button
            onClick={handleDesmarcar}
            disabled={guardando}
            className="text-xs text-gray-400 hover:text-gray-600 font-semibold flex items-center gap-1"
          >
            {guardando ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
            Deshacer
          </button>
        </div>
      </div>
    )
  }

  const { estado, diff, diffCost } = clasificarItemConteo(item, cantidad)
  const config = ESTADO_CONFIG[estado]
  const boton = typeof config.boton === 'function' ? config.boton(cantidad) : config.boton

  return (
    <div className={`bg-white p-4 rounded-2xl border shadow-sm transition-all space-y-3 ${config.cardBorder}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold text-gray-900 text-sm">{item.nombre_producto}</p>
        <button
          type="button"
          onClick={() => onVerImagen(item)}
          aria-label={`Ver foto de ${item.nombre_producto}`}
          className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors shrink-0"
        >
          <ImageIcon size={14} />
        </button>
        {config.badge(diff)}
        {diffCost ? (
          <span className={`text-xs font-bold shrink-0 ${diff < 0 ? 'text-red-600' : 'text-blue-600'}`}>
            {diff < 0 ? '' : '+'}
            {formatCurrency(diffCost)}
          </span>
        ) : null}
        {/* Solo mientras está pendiente: una vez empacado y ajustado en
            Alegra, quitarlo dejaría ese movimiento de inventario sin rastro
            de por qué se hizo (el backend lo rechaza igual). */}
        {onEliminar && (
          <button
            type="button"
            onClick={() => onEliminar(item.id)}
            aria-label={`Quitar ${item.nombre_producto} de la tanda`}
            title="Quitar de la tanda"
            className="ml-auto p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400">
        Ref: {item.referencia || 'N/A'} • {item.category || 'Sin categoría'} • Costo: {formatCurrency(item.costo_unitario)}
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-center bg-gray-50 px-3 py-1.5 rounded-2xl border border-gray-150 min-w-[70px] shrink-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block">Sistema</span>
            <span className="text-sm font-extrabold text-gray-700">{stockSistema}</span>
          </div>

          <div className="text-center min-w-[90px] shrink-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 block mb-0.5">Conteo Real</span>
            <input
              type="number"
              min="0"
              step="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="—"
              className="w-20 text-center py-1 px-2 border-2 border-gray-300 focus:border-emerald-500 rounded-xl font-extrabold text-sm focus:outline-none bg-white"
            />
          </div>
        </div>

        <button
          onClick={handleMarcar}
          disabled={guardando}
          className={`w-full sm:w-auto sm:flex-1 disabled:bg-gray-200 text-white text-sm font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1.5 ${boton.clase}`}
        >
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          <span className="text-center">{boton.texto}</span>
        </button>
      </div>
    </div>
  )
}
