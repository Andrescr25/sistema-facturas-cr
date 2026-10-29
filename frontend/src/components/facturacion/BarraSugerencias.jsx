import { useState } from 'react'
import { Sparkles, ChevronDown } from 'lucide-react'
import TarjetaSugerencia from './TarjetaSugerencia'
import { armarSugerencias } from '../../utils/sugerenciasFacturacion'

/**
 * "Suele faltar" — lo que este cliente lleva siempre, mientras se le toma el
 * pedido con él enfrente.
 *
 * PARA QUÉ. El agente tiene el pedido a medio armar y el cliente delante: es
 * el único momento en que preguntar "¿y la cuerda de albañil, no ocupa?" sirve
 * de algo. Después ya se fue.
 *
 * ES EL MISMO CÁLCULO QUE VE EL CLIENTE en su catálogo, a propósito: si fueran
 * dos cuentas distintas, el agente le ofrecería algo que el portal no le
 * muestra y la recomendación dejaría de ser creíble. Lo que Facturación suma
 * por encima (más productos y los de una sola compra) usa los mismos umbrales.
 *
 * DOS TAMAÑOS. La fila compacta de siempre (10 productos) no empuja el pedido
 * hacia abajo, que es lo que el agente está mirando. «Ver más» despliega el
 * resto en una cuadrícula con su propio desplazamiento, agrupado por motivo.
 *
 * TRES MOTIVOS, Y SE DICEN. Lo que compra seguido lleva las veces; lo que dejó
 * de comprar lleva los días; lo que llevó una vez lleva cuándo. "Hace 199 días"
 * es lo que le da al agente algo que decir; un "recomendado" a secas no.
 *
 * LO QUE YA ESTÁ EN LA FACTURA NO SE SUGIERE, y sin nada que sugerir no se
 * dibuja nada: una franja vacía sobre el pedido es peor que no tenerla.
 */
export default function BarraSugerencias({ sugerencias, items, onAgregar }) {
  const [abierta, setAbierta] = useState(false)
  const { fila, grupos, cantidadMas } = armarSugerencias(sugerencias, items)

  if (fila.length === 0) return null

  const soloHabitos = fila.every(p => p.motivo !== 'ocasional')

  return (
    // `w-full min-w-0`: la sección tiene que poder encogerse al ancho real
    // de donde la pongan. Sin `min-w-0`, un padre flex o grid la deja crecer
    // hasta el ancho de las tarjetas sin enrollar en vez de contenerla, y el
    // scroll horizontal de más abajo nunca llega a actuar — le pasó a esta
    // misma barra en Facturación (ver el comentario en Facturacion.jsx).
    <section className="card w-full min-w-0 rounded-2xl p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 flex-wrap items-center gap-x-2 font-bold text-neutro-900">
          <Sparkles size={18} className="shrink-0 text-acento-500" />
          Suele faltar
          <span className="text-xs font-semibold text-neutro-400">
            {soloHabitos ? 'lo que este cliente lleva siempre' : 'lo que este cliente ya ha llevado'}
          </span>
        </h3>

        {cantidadMas > 0 && (
          <button
            type="button"
            onClick={() => setAbierta(v => !v)}
            aria-expanded={abierta}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-bold text-acento-600 transition-colors hover:bg-acento-50"
          >
            {abierta ? 'Ver menos' : `Ver más (${cantidadMas})`}
            <ChevronDown size={14} className={`transition-transform ${abierta ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* En fila y con desplazamiento lateral: no puede empujar el pedido
          hacia abajo, que es lo que el agente está mirando. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {fila.map(p => <TarjetaSugerencia key={p.id} producto={p} onAgregar={onAgregar} compacta />)}
      </div>

      {abierta && cantidadMas > 0 && (
        // Con alto máximo y su propio desplazamiento: un cliente con 90
        // sugerencias no puede mandar la factura al fondo de la pantalla.
        <div className="mt-3 max-h-[55vh] space-y-4 overflow-y-auto overscroll-contain border-t border-neutro-100 pt-3">
          {grupos.map(g => (
            <div key={g.id}>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutro-500">
                {g.titulo} <span className="font-semibold text-neutro-400">({g.productos.length})</span>
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {g.productos.map(p => <TarjetaSugerencia key={p.id} producto={p} onAgregar={onAgregar} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
