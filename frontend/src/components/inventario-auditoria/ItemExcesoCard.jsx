import { useState } from 'react'
import { Check, Loader2, Undo2, ImageIcon, Trash2 } from 'lucide-react'
import { formatCurrency, clasificarItemConteo } from '../../utils/inventarioAuditoriaUtils'

// Mismos colores/lenguaje visual que ItemAuditoriaCard.jsx (hoja de conteo de
// auditorías normales), para que "¿coincide o no la cantidad?" se vea igual
// en todo el módulo.
const ESTADO_CONFIG = {
  // Un producto ya ajustado en el inventario propio: clasificarItemConteo lo devuelve como
  // 'ajustado' y esta tarjeta no lo contemplaba, así que config quedaba
  // undefined y la pantalla entera se caía al leer config.boton. Mismo
  // lenguaje visual que ItemAuditoriaCard, que sí lo tenía.
  ajustado: {
    cardBorder: 'border-exito-300 bg-exito-50/10',
    badge: (diff) => (
      <span className="bg-exito-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase">
        Ajustado ({diff > 0 ? '+' : ''}{diff})
      </span>
    ),
    boton: { texto: 'Marcar Empacado', clase: 'bg-primario-800 hover:bg-primario-900' }
  },
  pendiente: {
    cardBorder: 'border-neutro-100',
    badge: () => <span className="bg-neutro-100 text-neutro-500 text-xs font-bold px-2 py-0.5 rounded-md uppercase">Pendiente</span>,
    boton: { texto: 'Marcar Empacado', clase: 'bg-primario-800 hover:bg-primario-900' }
  },
  coincide: {
    cardBorder: 'border-exito-300 bg-exito-50/20',
    badge: () => <span className="bg-exito-200 text-exito-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Coincide</span>,
    boton: { texto: 'Marcar Empacado', clase: 'bg-primario-800 hover:bg-primario-900' }
  },
  falta: {
    cardBorder: 'border-peligro-300 bg-peligro-50/20',
    badge: (diff) => <span className="bg-peligro-200 text-peligro-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Falta ({diff})</span>,
    boton: (cantidad) => ({ texto: `Corregir a ${cantidad} y Marcar Empacado`, clase: 'bg-alerta-600 hover:bg-alerta-700' })
  },
  sobra: {
    cardBorder: 'border-primario-300 bg-primario-50/20',
    badge: (diff) => <span className="bg-primario-200 text-primario-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Sobra (+{diff})</span>,
    boton: (cantidad) => ({ texto: `Corregir a ${cantidad} y Marcar Empacado`, clase: 'bg-alerta-600 hover:bg-alerta-700' })
  }
}

/**
 * El descuento es lo que decide si el producto llega al catálogo público, así
 * que su ausencia tiene que verse: sin este aviso, una tanda entera puede
 * quedar invisible para el cliente sin que nada en la pantalla lo insinúe.
 */
function BadgeDescuento({ item }) {
  if (item.regalado) {
    return (
      <span className="bg-nota-100 text-nota-700 text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase shrink-0">
        Regalado
      </span>
    )
  }
  if (item.descuento_porcentaje === null || item.descuento_porcentaje === undefined) {
    return (
      <span
        title="Sin descuento no aparece en el catálogo público"
        className="bg-alerta-100 text-alerta-700 text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase shrink-0"
      >
        Sin descuento
      </span>
    )
  }
  return (
    <span className="bg-alerta-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase shrink-0">
      −{Number(item.descuento_porcentaje)}%
    </span>
  )
}

/**
 * Tarjeta de un producto dentro de la "factura de empaque" de un exceso.
 * El empleado marca "Empacado" directamente, o si la cantidad física no
 * coincide con inventario propio, la escribe antes de marcar — eso dispara la
 * corrección real de inventario en el inventario propio (mismo mecanismo que ya usan las
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
    const fueCorregido = item.ajustado_inventario && item.stock_real !== null && Number(item.stock_real) !== stockSistema
    const valorReal = fueCorregido ? Number(item.stock_real) : stockSistema
    const diff = valorReal - stockSistema

    return (
      <div className="bg-white p-4 rounded-2xl border border-exito-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Check className="text-exito-600 shrink-0" size={20} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-neutro-900 text-sm truncate">{item.nombre_producto}</p>
              <button
                type="button"
                onClick={() => onVerImagen(item)}
                aria-label={`Ver foto de ${item.nombre_producto}`}
                className="p-1 text-neutro-400 hover:text-exito-600 hover:bg-exito-50 rounded-lg transition-colors shrink-0"
              >
                <ImageIcon size={14} />
              </button>
              {fueCorregido ? (
                <span className="bg-exito-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase">
                  Ajustado ({diff > 0 ? '+' : ''}{diff})
                </span>
              ) : (
                <span className="bg-exito-200 text-exito-700 text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase">
                  Empacado • Cantidad correcta
                </span>
              )}
              <BadgeDescuento item={item} />
            </div>
            <p className="text-xs text-neutro-500">Ref: {item.referencia || 'N/A'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="text-center bg-neutro-50 px-3 py-1.5 rounded-2xl border border-neutro-200 min-w-[64px]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-neutro-400 block">Sistema</span>
              <span className="text-sm font-extrabold text-neutro-700">{stockSistema}</span>
            </div>
            <div className="text-center bg-exito-50 px-3 py-1.5 rounded-2xl border border-exito-200 min-w-[64px]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-exito-600 block">Empacado</span>
              <span className="text-sm font-extrabold text-exito-700">{valorReal}</span>
            </div>
          </div>
          <button
            onClick={handleDesmarcar}
            disabled={guardando}
            className="text-xs text-neutro-400 hover:text-neutro-600 font-semibold flex items-center gap-1"
          >
            {guardando ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
            Deshacer
          </button>
        </div>
      </div>
    )
  }

  const { estado, diff, diffCost } = clasificarItemConteo(item, cantidad)
  // Nunca dejar que un estado no contemplado tumbe la pantalla: sin este
  // respaldo, agregar un estado al clasificador rompe esta tarjeta en blanco.
  const config = ESTADO_CONFIG[estado] || ESTADO_CONFIG.pendiente
  const boton = typeof config.boton === 'function' ? config.boton(cantidad) : config.boton

  return (
    <div className={`bg-white p-4 rounded-2xl border shadow-sm transition-all space-y-3 ${config.cardBorder}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold text-neutro-900 text-sm">{item.nombre_producto}</p>
        <button
          type="button"
          onClick={() => onVerImagen(item)}
          aria-label={`Ver foto de ${item.nombre_producto}`}
          className="p-1 text-neutro-400 hover:text-exito-600 hover:bg-exito-50 rounded-lg transition-colors shrink-0"
        >
          <ImageIcon size={14} />
        </button>
        {config.badge(diff)}
        <BadgeDescuento item={item} />
        {diffCost ? (
          <span className={`text-xs font-bold shrink-0 ${diff < 0 ? 'text-peligro-600' : 'text-primario-600'}`}>
            {diff < 0 ? '' : '+'}
            {formatCurrency(diffCost)}
          </span>
        ) : null}
        {/* Solo mientras está pendiente: una vez empacado y ajustado en
            inventario propio, quitarlo dejaría ese movimiento de inventario sin rastro
            de por qué se hizo (el backend lo rechaza igual). */}
        {onEliminar && (
          <button
            type="button"
            onClick={() => onEliminar(item.id)}
            aria-label={`Quitar ${item.nombre_producto} de la tanda`}
            title="Quitar de la tanda"
            className="ml-auto p-1 text-neutro-300 hover:text-peligro-600 hover:bg-peligro-50 rounded-lg transition-colors shrink-0"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <p className="text-xs text-neutro-400">
        Ref: {item.referencia || 'N/A'} • {item.category || 'Sin categoría'} • Costo: {formatCurrency(item.costo_unitario)}
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-center bg-neutro-50 px-3 py-1.5 rounded-2xl border border-neutro-200 min-w-[70px] shrink-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutro-400 block">Sistema</span>
            <span className="text-sm font-extrabold text-neutro-700">{stockSistema}</span>
          </div>

          <div className="text-center min-w-[90px] shrink-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-exito-600 block mb-0.5">Conteo Real</span>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="—"
              className="w-20 text-center py-1 px-2 border-2 border-neutro-300 focus:border-primario-500 rounded-xl font-extrabold text-sm focus:outline-none bg-white"
            />
          </div>
        </div>

        <button
          onClick={handleMarcar}
          disabled={guardando}
          className={`w-full sm:w-auto sm:flex-1 disabled:bg-neutro-200 text-white text-sm font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1.5 ${boton.clase}`}
        >
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          <span className="text-center">{boton.texto}</span>
        </button>
      </div>
    </div>
  )
}
