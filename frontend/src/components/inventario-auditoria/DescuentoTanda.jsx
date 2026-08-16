import { useMemo, useState } from 'react'
import { Tag, Loader2, AlertTriangle } from 'lucide-react'

const ATAJOS = [10, 20, 30, 40, 50]

/**
 * Descuento global de una tanda de excesos.
 *
 * El descuento es lo que decide si el producto se ve en el catálogo público
 * (catalogo-publico.service.js exige fila en producto_descuento_exceso), pero
 * hasta ahora la pantalla de empaque no lo mostraba ni dejaba tocarlo: había
 * que ir producto por producto a la pestaña de Descuentos. Acá se ve el
 * estado real de la tanda y se cambia de un golpe.
 */
export default function DescuentoTanda({ items, onAplicar, aplicando }) {
  const [valor, setValor] = useState('')

  const resumen = useMemo(() => {
    const conDescuento = items.filter(i => i.descuento_porcentaje !== null && i.descuento_porcentaje !== undefined)
    const porcentajes = [...new Set(conDescuento.map(i => Number(i.descuento_porcentaje)))].sort((a, b) => a - b)
    return {
      sinDescuento: items.length - conDescuento.length,
      porcentajes,
      regalados: items.filter(i => i.regalado).length
    }
  }, [items])

  const handleAplicar = () => {
    if (valor === '') return
    onAplicar(Number(valor))
    setValor('')
  }

  if (items.length === 0) return null

  return (
    <div className="bg-white rounded-3xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="bg-amber-50 text-amber-600 p-2 rounded-xl shrink-0">
          <Tag size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900">Descuento de la tanda</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Es lo que ve el cliente en el catálogo público. Un producto sin descuento{' '}
            <strong className="text-gray-700">no aparece ahí</strong>, aunque esté empacado.
          </p>
        </div>
      </div>

      {resumen.sinDescuento > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-150 rounded-2xl px-3 py-2.5">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            <strong>{resumen.sinDescuento}</strong> de {items.length} producto(s) no tienen descuento, así que
            no se ven en el catálogo. Poneles uno acá abajo.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Aplicar a los {items.length}</span>
        {ATAJOS.map(p => (
          <button
            key={p}
            type="button"
            disabled={aplicando}
            onClick={() => onAplicar(p)}
            className="px-3 py-1.5 rounded-xl border-2 border-gray-200 hover:border-amber-500 hover:bg-amber-50 text-sm font-extrabold text-gray-700 disabled:opacity-40 transition-colors"
          >
            {p}%
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAplicar()}
            placeholder="Otro"
            className="w-20 text-center py-1.5 px-2 border-2 border-gray-200 focus:border-amber-500 rounded-xl font-extrabold text-sm focus:outline-none"
          />
          <button
            type="button"
            disabled={aplicando || valor === ''}
            onClick={handleAplicar}
            className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-200 text-white text-sm font-bold py-1.5 px-4 rounded-xl transition-colors flex items-center gap-1.5"
          >
            {aplicando ? <Loader2 size={14} className="animate-spin" /> : null}
            Aplicar
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        {resumen.porcentajes.length > 0 && (
          <>Ahora mismo: {resumen.porcentajes.map(p => `${p}%`).join(', ')}
            {resumen.regalados > 0 ? ` · ${resumen.regalados} regalado(s)` : ''} · </>
        )}
        Poner <strong>0%</strong> los saca del catálogo.
      </p>
    </div>
  )
}
