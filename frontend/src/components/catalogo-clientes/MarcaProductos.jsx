import { ChevronRight, Plus } from 'lucide-react'
import PortadaMarca from '../catalogo/PortadaMarca'
import InputCantidad from './InputCantidad'
import { formatearColones } from '../../utils/catalogoClientesUtils'

/** Cada control compra el producto propio, nunca el id de la marca. */
export default function MarcaProductos({ grupo, carrito, onCambiar, onAbrir }) {
  return (
    <PortadaMarca marca={grupo.marca} cantidad={grupo.presentaciones.length} className="col-span-full">
      <div className="flex items-center justify-between border-t border-neutro-100 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-neutro-400 sm:px-5">
        <span>Presentación</span><span>Precio con IVA</span>
      </div>
      <ul className="divide-y divide-neutro-100">
        {grupo.presentaciones.map(p => {
          const cantidad = carrito[p.id]?.cantidad || 0
          return (
            <li key={p.id} className={cantidad > 0 ? 'bg-cliente-50/50' : ''}>
              <button type="button" onClick={() => onAbrir(p.id, p)} aria-label={`Ver ${p.nombre}`}
                className="flex min-h-14 w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-neutro-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cliente-500 sm:px-5">
                <span className="min-w-0 flex-1 break-words text-xs font-semibold leading-5 text-neutro-800 sm:text-sm">{p.nombre}</span>
                <span className="shrink-0 text-right">
                  {p.precioLista && <span className="block text-[10px] text-neutro-400 line-through">{formatearColones(p.precioLista)}</span>}
                  <span className={`block text-sm font-extrabold sm:text-base ${p.descuento ? 'text-peligro-600' : 'text-neutro-900'}`}>{formatearColones(p.precio)}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-neutro-400" aria-hidden="true" />
              </button>
              {onCambiar && (
                <div className="flex justify-end px-4 pb-3 sm:px-5">
                  {cantidad > 0 ? (
                    <div className="w-40"><InputCantidad cantidad={cantidad} onCambiar={n => onCambiar(p, n)} etiqueta={p.nombre} compacto /></div>
                  ) : (
                    <button type="button" onClick={() => onCambiar(p, 1)} aria-label={`Agregar ${p.nombre}`}
                      className="flex min-h-10 items-center gap-1 rounded-lg bg-neutro-900 px-3 text-xs font-bold text-white hover:bg-cliente-600">
                      <Plus size={14} /> Agregar
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </PortadaMarca>
  )
}
