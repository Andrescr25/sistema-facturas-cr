import { useEffect, useState } from 'react'
import { RotateCcw, Loader2, Package, ChevronRight } from 'lucide-react'
import apiPortal from '../../services/apiPortal'
import { formatearColones } from '../../utils/catalogoClientesUtils'

/**
 * "Volver a pedir": las compras anteriores del cliente.
 *
 * Tocar una ABRE el detalle para revisarla, no la manda al carrito de una:
 * casi nunca se repite una compra idéntica, y con facturas de hasta 45
 * productos hacer que después vaya a sacar lo que no quería es peor que
 * mostrárselo antes.
 *
 * Sale de venta_historico, donde está la historia de verdad: las 5.261
 * facturas, no el puñado de pedidos hechos por acá.
 */
export default function VolverAPedir({ onAbrir }) {
  const [compras, setCompras] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true
    apiPortal.get('/portal/compras')
      .then(({ data }) => { if (vigente) setCompras(data.data) })
      .catch(() => { if (vigente) setCompras([]) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [])

  if (cargando) {
    return <div className="py-6 flex justify-center"><Loader2 size={20} className="animate-spin text-emerald-600" /></div>
  }
  if (compras.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-sky-50 text-sky-600 shrink-0">
          <RotateCcw size={14} />
        </div>
        <div>
          <h2 className="font-bold text-slate-900 text-[13px] leading-tight">Volver a pedir</h2>
          <p className="text-[11px] text-slate-400 leading-tight">Sus compras anteriores, listas para repetir</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {compras.map(c => (
          <div
            key={c.facturaId}
            className="min-w-[168px] shrink-0"
          >
            <button
              type="button"
              onClick={() => onAbrir(c.facturaId)}
              className="w-full text-left bg-white border border-slate-150 hover:border-emerald-400 rounded-xl p-2.5 space-y-1.5 transition-colors"
            >
            <div>
              <p className="text-[12px] font-bold text-slate-900 leading-tight">
                {new Date(c.fecha).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <Package size={10} />
                {c.productos} producto{c.productos === 1 ? '' : 's'} · {formatearColones(c.total)}
              </p>
            </div>
            <span className="w-full h-8 rounded-lg bg-slate-100 text-[12px] font-semibold text-slate-700 flex items-center justify-center gap-1">
              Ver y repetir
              <ChevronRight size={13} />
            </span>
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
