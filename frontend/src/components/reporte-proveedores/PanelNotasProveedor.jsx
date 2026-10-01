import { useMemo, useState } from 'react'
import { StickyNote, ChevronDown, Loader2 } from 'lucide-react'

/**
 * Todas las notas de esta orden, juntas y plegadas.
 *
 * POR QUÉ ADEMÁS DE LAS DE CADA PRODUCTO. Las de abajo sirven mientras se
 * revisa producto por producto. Esta sirve ANTES: para leer de un vistazo
 * todo lo que hay que tener presente en este pedido —o para leérselo al
 * proveedor por teléfono— sin ir bajando por una lista de cuarenta líneas.
 *
 * NACE CERRADA. La mayoría de los pedidos no tiene ninguna nota, y los que
 * tienen suelen tener dos o tres: abrirla sola empujaría hacia abajo lo que
 * de verdad se vino a hacer, que es poner cantidades.
 *
 * SI NO HAY NOTAS NO SE DIBUJA NADA. Un panel que dice "no hay nada" ocupa el
 * mismo espacio que uno que sí tiene algo, y enseña a ignorarlo.
 */
export default function PanelNotasProveedor({ productos, notasPorProducto, cargando }) {
  const [abierto, setAbierto] = useState(false)

  const conNotas = useMemo(() => {
    return (productos || [])
      .map(p => ({ producto: p, notas: notasPorProducto?.[String(p.producto_id)] || [] }))
      .filter(x => x.notas.length > 0)
  }, [productos, notasPorProducto])

  if (cargando) {
    return (
      <div className="mb-4 flex items-center gap-2 text-xs text-neutro-400">
        <Loader2 size={13} className="animate-spin" />
        Buscando las notas de estos productos…
      </div>
    )
  }

  if (conNotas.length === 0) return null

  const total = conNotas.reduce((s, x) => s + x.notas.length, 0)

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-alerta-200 bg-alerta-50">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-alerta-800">
          <StickyNote size={16} strokeWidth={2.5} />
          <span className="text-sm font-bold">
            {conNotas.length} {conNotas.length === 1 ? 'producto tiene' : 'productos tienen'} notas del cliente
          </span>
          <span className="text-xs font-semibold text-alerta-700">
            · {total} en total
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-alerta-700 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {!abierto && (
        <p className="px-4 pb-3 text-xs text-alerta-800/80">
          Dicen qué variante pidió el cliente. Conviene leerlas antes de hacer el pedido.
        </p>
      )}

      {abierto && (
        <ul className="divide-y divide-alerta-200/70 border-t border-alerta-200">
          {conNotas.map(({ producto, notas }, i) => (
            <li key={`${producto.codigo}-${i}`} className="px-4 py-2.5">
              <p className="text-xs font-bold text-neutro-900">{producto.nombre}</p>
              <ul className="mt-1 space-y-0.5">
                {notas.map((n, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-alerta-500" />
                    <p className="min-w-0 text-xs text-alerta-950">
                      <span className="font-semibold whitespace-pre-wrap">{n.nota}</span>
                      {n.clientes?.length > 0 && (
                        <span className="ml-1 text-alerta-700/80">— {n.clientes.join(', ')}</span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
