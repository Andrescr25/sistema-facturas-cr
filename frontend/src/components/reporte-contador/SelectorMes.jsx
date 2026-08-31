import { ChevronLeft, ChevronRight } from 'lucide-react'
import { mesNombre } from '../../utils/reporteContadorUtils'

function moverMes({ anio, mes }, delta) {
  const d = new Date(anio, mes - 1 + delta, 1)
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 }
}

export default function SelectorMes({ periodo, onCambiar }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onCambiar(moverMes(periodo, -1))}
        className="p-2 rounded-xl border border-neutro-200 hover:bg-neutro-50 transition"
      >
        <ChevronLeft size={18} className="text-neutro-600" />
      </button>
      <h2 className="text-lg font-bold text-neutro-900 capitalize min-w-[11rem] text-center">
        {mesNombre(periodo.mes)} {periodo.anio}
      </h2>
      <button
        onClick={() => onCambiar(moverMes(periodo, 1))}
        className="p-2 rounded-xl border border-neutro-200 hover:bg-neutro-50 transition"
      >
        <ChevronRight size={18} className="text-neutro-600" />
      </button>
    </div>
  )
}
