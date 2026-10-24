import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import TarjetaProducto from './TarjetaProducto'
import { useCarruselAuto } from '../../hooks/useCarruselAuto'
import { useScrollInfinito } from '../../hooks/useScrollInfinito'

const VISIBLES_AL_INICIO = 6
const TANDA = 6

/**
 * Una sección de la portada.
 *
 * `variante 'ofertas'` la deja en carrusel horizontal: son pocas y conviene
 * que se recorran de lado sin empujar el catálogo hacia abajo. El resto va
 * en cuadrícula, colapsada de entrada — tres secciones enteras serían ~70
 * tarjetas antes de llegar al catálogo — y el resto se revela solo, de a
 * `TANDA`, con el mismo centinela de scroll que usa el catálogo completo
 * (useScrollInfinito): no hace falta pedir nada al servidor, esta lista ya
 * está entera en memoria, así que "cargar más" es simplemente mostrar más.
 */
export default function SeccionProductos({
  titulo, descripcion, icono: Icono, color, productos,
  carrito, onCambiar, nota, onAbrir, variante = 'cuadricula'
}) {
  const [cantidadVisible, setCantidadVisible] = useState(VISIBLES_AL_INICIO)
  const esOfertas = variante === 'ofertas'

  // Los hooks van ANTES del retorno temprano: no pueden ejecutarse
  // condicionalmente. Se les pasa `activo`/`hayMas` en falso para que no
  // animen ni observen lo que no es un carrusel o ya está completo.
  const carrusel = useCarruselAuto({ activo: esOfertas && productos?.length > 0 })
  const hayMas = !esOfertas && (productos?.length || 0) > cantidadVisible
  const centinela = useScrollInfinito({
    hayMas,
    cargando: false,
    cargarMas: () => setCantidadVisible((n) => n + TANDA)
  })

  if (!productos || productos.length === 0) return null
  const mostrados = esOfertas ? productos : productos.slice(0, cantidadVisible)
  const ocultos = productos.length - mostrados.length

  const tarjeta = (p) => (
    <TarjetaProducto
      key={p.id}
      producto={p}
      cantidad={carrito[p.id]?.cantidad || 0}
      onCambiar={onCambiar}
      nota={nota?.(p)}
      onAbrir={onAbrir ? () => onAbrir(p.id, p) : undefined}
    />
  )

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {Icono && (
            <div className={`p-1.5 rounded-lg shrink-0 ${color}`}>
              <Icono size={14} />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-bold text-neutro-900 text-[13px] leading-tight">{titulo}</h2>
            {descripcion && <p className="text-[11px] text-neutro-400 leading-tight">{descripcion}</p>}
          </div>
        </div>
        <span className="text-[11px] font-semibold text-neutro-300 shrink-0">{productos.length}</span>
      </div>

      {esOfertas ? (
        <div
          ref={carrusel}
          className="flex items-stretch gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none"
        >
          {mostrados.map(p => (
            <div key={p.id} className="w-40 shrink-0 flex">{tarjeta(p)}</div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {mostrados.map(tarjeta)}
          </div>

          {ocultos > 0 && (
            <div ref={centinela} className="h-8 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin text-neutro-300" />
            </div>
          )}
        </>
      )}
    </section>
  )
}
