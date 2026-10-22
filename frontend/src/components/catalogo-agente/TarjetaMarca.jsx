import { memo } from 'react'
import { ChevronRight, Package } from 'lucide-react'
import { colones } from '../../utils/colones'
import { urlArchivo } from '../../utils/urlArchivo'
import { precioCatalogoAgente } from '../../utils/precioCatalogoAgente'

function TarjetaMarca({ grupo, onVerProducto }) {
  const foto = urlArchivo(grupo.marca.imagen?.url)
  return (
    <article className="catalogo-ficha min-w-0 overflow-hidden rounded-2xl bg-white ring-1 ring-neutro-200">
      <h3 className="break-words px-4 pb-2 pt-5 text-base font-medium leading-snug tracking-tight text-neutro-800 sm:text-lg">{grupo.marca.nombre}</h3>
      <div className="flex h-40 items-center justify-center px-4 pb-3 sm:h-48">
        {foto ? <img src={foto} alt={grupo.marca.nombre} loading="lazy" decoding="async" className="h-full w-full object-contain" />
          : <div className="flex h-full w-full items-center justify-center rounded-xl bg-neutro-50 text-neutro-300"><Package size={42} aria-label="Sin foto de marca" /></div>}
      </div>
      <div className="flex justify-between gap-3 border-y border-neutro-100 bg-neutro-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutro-500"><span>Presentación</span><span className="pr-5">Precio</span></div>
      <ul className="divide-y divide-neutro-100">
        {grupo.presentaciones.map(p => {
          const precio = precioCatalogoAgente(p)
          return <li key={p.id}>
            <button type="button" onClick={() => onVerProducto(p)} aria-label={`Ver ${p.name}`}
              className="flex min-h-14 w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-primario-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primario-500">
              <span className="min-w-0 flex-1 text-xs font-semibold leading-5 text-neutro-800 sm:text-sm">{p.name}</span>
              <span className="shrink-0 text-right">
                {precio.tachado > 0 && <span className="block text-[10px] text-neutro-400 line-through">{colones(precio.tachado)}</span>}
                <span className={`block text-sm font-extrabold sm:text-base ${precio.tachado > 0 ? 'text-nota-700' : 'text-neutro-900'}`}>{colones(precio.final)}</span>
                {precio.tachado > 0 && <span className="block text-[10px] font-bold text-nota-700">{precio.descuento > 0 ? 'Liquidación' : 'Oferta'}</span>}
              </span>
              <ChevronRight size={14} className="shrink-0 text-neutro-400" aria-hidden="true" />
            </button>
          </li>
        })}
      </ul>
      <p className="border-t border-neutro-100 px-4 py-3 text-[11px] font-medium text-neutro-500">Precios con IVA incluido</p>
    </article>
  )
}
export default memo(TarjetaMarca)
