import { ChevronLeft, ChevronRight } from 'lucide-react'
import { mesNombre, moverMes } from '../../utils/reporteContadorUtils'

export default function SelectorMes({ periodo, onCambiar }) {
  return (
    <div className="flex items-center gap-2">
      <button
        aria-label="Mes anterior"
        onClick={() => onCambiar(moverMes(periodo, -1))}
        className="p-2 rounded-xl border border-neutro-200 hover:bg-neutro-50 transition"
      >
        <ChevronLeft size={18} className="text-neutro-600" />
      </button>
      <h2 className="text-lg font-bold text-neutro-900 capitalize min-w-[11rem] text-center">
        {mesNombre(periodo.mes)} {periodo.anio}
      </h2>
      <button
        aria-label="Mes siguiente"
        onClick={() => onCambiar(moverMes(periodo, 1))}
        className="p-2 rounded-xl border border-neutro-200 hover:bg-neutro-50 transition"
      >
        <ChevronRight size={18} className="text-neutro-600" />
      </button>
    </div>
  )
}
