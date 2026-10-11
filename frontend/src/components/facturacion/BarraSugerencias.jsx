import { Sparkles, Plus, Package } from 'lucide-react'
import { urlArchivo } from '../../utils/urlArchivo'

const TOPE = 10
// De los 10, hasta 3 se guardan para lo que DEJÓ de llevar. Sin esta reserva,
// un cliente con 20 productos habituales llenaba la barra con ellos y el
// "hace 199 días que no lo lleva" no aparecía nunca — y ese es justo el que
// le da al agente algo que preguntar.
const RESERVA_PERDIDOS = 3

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
 * muestra y la recomendación dejaría de ser creíble.
 *
 * DOS MOTIVOS DISTINTOS, Y SE DICEN. Lo que compra seguido lleva las veces; lo
 * que dejó de comprar lleva los días. "Hace 199 días" es lo que le da al
 * agente algo que decir; un "recomendado" a secas no.
 *
 * LO QUE YA ESTÁ EN LA FACTURA NO SE SUGIERE, y sin nada que sugerir no se
 * dibuja nada: una franja vacía sobre el pedido es peor que no tenerla.
 */
export default function BarraSugerencias({ sugerencias, items, onAgregar }) {
  const yaEsta = (id) => (items || []).some(i => String(i.id) === String(id))

  // Se marca de dónde viene cada uno al armar la lista, no comparando objetos
  // después: los dos motivos se dicen distinto y hay que poder distinguirlos
  // sin depender de la identidad de la referencia.
  const habituales = (sugerencias?.habituales || [])
    .filter(p => !yaEsta(p.id))
    .map(p => ({ ...p, dejoDeLlevar: false }))
  const perdidos = (sugerencias?.perdidos || [])
    .filter(p => !yaEsta(p.id))
    .map(p => ({ ...p, dejoDeLlevar: true }))

  // Los perdidos toman su reserva; los habituales llenan el resto. Si no hay
  // perdidos, los habituales se quedan con todo el espacio.
  const delFinal = perdidos.slice(0, RESERVA_PERDIDOS)
  const lista = [
    ...habituales.slice(0, TOPE - delFinal.length),
    ...delFinal
  ]

  if (lista.length === 0) return null

  return (
    // `w-full min-w-0`: la sección tiene que poder encogerse al ancho real
    // de donde la pongan. Sin `min-w-0`, un padre flex o grid la deja crecer
    // hasta el ancho de las tarjetas sin enrollar en vez de contenerla, y el
    // scroll horizontal de más abajo nunca llega a actuar — le pasó a esta
    // misma barra en Facturación (ver el comentario en Facturacion.jsx).
    <section className="card w-full min-w-0 rounded-2xl p-4 md:p-5">
      <h3 className="mb-3 flex items-center gap-2 font-bold text-neutro-900">
        <Sparkles size={18} className="text-acento-500" />
        Suele faltar
        <span className="text-xs font-semibold text-neutro-400">
          lo que este cliente lleva siempre
        </span>
      </h3>

      {/* En fila y con desplazamiento lateral: no puede empujar el pedido
          hacia abajo, que es lo que el agente está mirando. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {lista.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onAgregar(p)}
              title={`Agregar ${p.nombre}`}
              className="group flex w-36 shrink-0 flex-col gap-1.5 rounded-xl border border-neutro-200 bg-white p-2 text-left transition-colors hover:border-acento-300 hover:bg-acento-50/40"
            >
              <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded-lg bg-neutro-50">
                {p.imagen
                  ? <img src={urlArchivo(p.imagen)} alt="" loading="lazy" className="h-full w-full object-contain" />
                  : <Package size={20} className="text-neutro-300" />}
              </div>

              <p className="line-clamp-2 text-[11px] font-bold leading-tight text-neutro-800">
                {p.nombre}
              </p>

              <p className="text-[10px] font-semibold text-neutro-500">
                {p.dejoDeLlevar
                  ? `Hace ${p.dias} días que no lo lleva`
                  : `Lo lleva ${p.veces} ${p.veces === 1 ? 'vez' : 'veces'}`}
              </p>

              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-acento-600">
                <Plus size={11} />Agregar
              </span>
            </button>
        ))}
      </div>
    </section>
  )
}
