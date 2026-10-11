import { Package, Trash2, CheckCircle } from 'lucide-react'
import { formatCurrency } from '../../utils/inventarioAuditoriaUtils'

/**
 * Lista de productos ya agregados a una devolución en progreso — como las
 * líneas de una factura: producto, cantidad devuelta, stock antes/después,
 * valor, y botón para quitarlo (si aún no se aplicó el ajuste en el inventario propio).
 */
export default function ListaItemsDevolucion({ items, onQuitar }) {
  if (!items || items.length === 0) {
    return (
      <div className="bg-white p-12 text-center text-neutro-400 rounded-3xl border border-neutro-100 shadow-sm flex flex-col items-center justify-center gap-3">
        <Package size={32} className="text-neutro-300" />
        <span>Todavía no has agregado productos a esta devolución.</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl border border-neutro-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-neutro-100 bg-neutro-50/50">
        <h3 className="font-bold text-neutro-900">Productos Devueltos ({items.length})</h3>
      </div>
      <div className="divide-y divide-neutro-100">
        {items.map(item => {
          const cantidad = Number(item.stock_real) - Number(item.stock_sistema)
          const valor = cantidad * Number(item.costo_unitario || 0)
          return (
            <div key={item.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold text-neutro-900 text-sm truncate">{item.nombre_producto}</p>
                <p className="text-xs text-neutro-400">
                  Ref: {item.referencia || 'N/A'} • Stock: {Number(item.stock_sistema)} → <strong className="text-neutro-600">{Number(item.stock_real)}</strong>
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <span className="inline-block font-extrabold text-xs px-2.5 py-0.5 rounded-md uppercase bg-primario-100 text-primario-800">
                    {cantidad > 0 ? '+' : ''}{cantidad} unid.
                  </span>
                  <p className="text-xs font-bold mt-1 text-primario-600">{formatCurrency(valor)}</p>
                </div>
                {item.ajustado_inventario ? (
                  <span className="text-exito-600" title="Ya aplicado en el inventario propio">
                    <CheckCircle size={18} />
                  </span>
                ) : (
                  <button
                    onClick={() => onQuitar(item.id)}
                    className="text-neutro-400 hover:text-peligro-600 transition-colors p-1.5"
                    title="Quitar de la devolución"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
