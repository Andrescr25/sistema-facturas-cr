import { ChevronLeft, ChevronRight } from 'lucide-react'
import Boton from '../ui/Boton'
import { fechaEnPalabras } from '../../utils/fechaCR'

const corta = (f) => fechaEnPalabras(f, { day: 'numeric', month: 'short' })

/** Recorrer las quincenas: la anterior y la siguiente las dice el servidor. */
export default function SelectorQuincena({ periodo, onElegir }) {
  return (
    <div className="card flex items-center justify-between gap-2 p-3">
      <Boton variante="fantasma" icono={ChevronLeft} disabled={!periodo.anterior} onClick={() => onElegir(periodo.anterior)} aria-label="Quincena anterior" />
      <div className="min-w-0 text-center">
        <p className="font-bold text-neutro-900">{periodo.nombre}</p>
        <p className="text-xs text-neutro-500">{corta(periodo.desde)} al {corta(periodo.hasta)}{periodo.enCurso ? ' · en curso' : ''}</p>
      </div>
      <Boton variante="fantasma" icono={ChevronRight} disabled={!periodo.siguiente} onClick={() => onElegir(periodo.siguiente)} aria-label="Quincena siguiente" />
    </div>
  )
}
