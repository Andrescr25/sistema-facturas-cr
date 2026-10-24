import { Package } from 'lucide-react'
import { urlArchivo } from '../../utils/urlArchivo'

/** Portada común a ambos catálogos. La foto llena el panel sin franjas;
 * reserva su proporción y se estira con las presentaciones, sin duplicarla.
 * El archivo original no se recorta: el encuadre pertenece a esta vista. */
export default function PortadaMarca({ marca, cantidad, children, className = '' }) {
  const foto = urlArchivo(marca.imagen?.url)
  const ancho = marca.imagen?.ancho || 2
  const alto = marca.imagen?.alto || 3
  return (
    <article className={`grid min-w-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutro-200 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] ${className}`}>
      {foto ? (
        <div className="relative min-w-0 w-full self-stretch overflow-hidden bg-neutro-900" style={{ aspectRatio: `${ancho} / ${alto}` }}>
          <img src={foto} alt={marca.nombre} width={ancho} height={alto} loading="lazy" decoding="async"
            className="absolute inset-0 h-full w-full object-cover" />
        </div>
      ) : (
        // Sin foto todavía: la portada es el nombre, en los colores del sistema.
        <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 bg-gradient-to-br from-primario-700 to-primario-950 px-4 py-6 text-center sm:min-h-[12rem]">
          <Package size={28} className="text-white/40" aria-hidden="true" />
          <p className="break-words text-2xl font-extrabold leading-tight tracking-tight text-white">{marca.nombre}</p>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primario-600">Marca</p>
          <h3 className="break-words text-lg font-bold leading-snug tracking-tight text-neutro-900 sm:text-xl">{marca.nombre}</h3>
          <p className="mt-0.5 text-xs text-neutro-500">{cantidad} {cantidad === 1 ? 'presentación' : 'presentaciones'} · precios con IVA</p>
        </header>
        {children}
        <p className="mt-auto border-t border-neutro-100 px-4 py-3 text-[11px] font-medium text-neutro-500 sm:px-5">Tocá una presentación para ver su foto · IVA incluido</p>
      </div>
    </article>
  )
}
