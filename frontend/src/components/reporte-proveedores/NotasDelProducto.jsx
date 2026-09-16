import { useState } from 'react'
import { StickyNote, ChevronDown } from 'lucide-react'

/**
 * Las notas que se le escribieron a un producto al facturarlo.
 *
 * PARA QUÉ. Casi siempre dicen QUÉ VARIANTE quería el cliente —"AZUL", "OJO
 * NEGRA", "Solo 75w", "Niño y niña"— y muchas describen variantes que todavía
 * no están en el catálogo. Quien alista ya las veía en Bodega; quien compra
 * no, y sin ellas se termina comprando la variante equivocada.
 *
 * SE USA EL MISMO ÁMBAR QUE BODEGA a propósito: es la misma información, y
 * quien la vio alistando la reconoce sin tener que aprender un código nuevo.
 *
 * SOLO EL 6 % DE LAS LÍNEAS TIENE NOTA, así que esto no puede ensuciar al otro
 * 94 %: cuando no hay nota, no se dibuja nada. Con una o dos se muestran
 * enteras —son cortas—, y de ahí en adelante se pliegan, porque un producto
 * que diez clientes pidieron distinto no se resuelve leyendo diez líneas de
 * corrido.
 */

const VISIBLES = 2

function Nota({ n }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-alerta-400" />
      <p className="min-w-0 text-xs leading-relaxed text-alerta-950">
        <span className="font-bold whitespace-pre-wrap">{n.nota}</span>
        {n.veces > 1 && (
          <span className="ml-1 font-semibold text-alerta-700">· {n.veces} veces</span>
        )}
        {n.clientes?.length > 0 && (
          <span className="ml-1 text-alerta-700/80">
            — {n.clientes.slice(0, 2).join(', ')}
            {n.clientes.length > 2 && ` y ${n.clientes.length - 2} más`}
          </span>
        )}
      </p>
    </li>
  )
}

export default function NotasDelProducto({ notas }) {
  const [abierto, setAbierto] = useState(false)
  if (!notas || notas.length === 0) return null

  const hayDeMas = notas.length > VISIBLES
  const mostradas = abierto || !hayDeMas ? notas : notas.slice(0, VISIBLES)

  return (
    <div className="mt-2 rounded-xl border border-alerta-200 bg-alerta-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-alerta-700">
        <StickyNote size={13} strokeWidth={2.5} />
        <span className="text-[10px] font-extrabold uppercase tracking-wider">
          Lo que pidió el cliente
        </span>
      </div>

      <ul className="mt-1.5 space-y-1">
        {mostradas.map((n, i) => <Nota key={`${n.nota}-${i}`} n={n} />)}
      </ul>

      {hayDeMas && (
        <button
          type="button"
          onClick={() => setAbierto(v => !v)}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-alerta-700 hover:text-alerta-900"
        >
          <ChevronDown size={12} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
          {abierto ? 'Ver menos' : `Ver las otras ${notas.length - VISIBLES}`}
        </button>
      )}
    </div>
  )
}
