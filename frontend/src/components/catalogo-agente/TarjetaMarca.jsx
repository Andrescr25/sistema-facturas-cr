import { memo } from 'react'
import { ChevronRight } from 'lucide-react'
import { colones } from '../../utils/colones'
import PortadaMarca from '../catalogo/PortadaMarca'
import { precioCatalogoAgente } from '../../utils/precioCatalogoAgente'
import { esMarcaExtensa } from '../../utils/marcasCatalogo'

/**
 * La portada de una marca: presenta sus productos, no es una tarjeta más.
 *
 * POR QUÉ ASÍ (2026-10-22, el usuario: «la foto de marca es una foto con
 * fondo, todo llamativo… no una card más de producto, sino una portada para
 * dar a presentar los productos»). La foto de marca es un póster: arte a
 * sangre, colores y letras propias. Antes iba chica, con relleno blanco,
 * como la foto de un producto. Ahora:
 *   · ocupa dos casillas, o la fila completa si tiene muchas presentaciones
 *     (ver anchoEnFila en utils/filasCatalogo.js);
 *   · PortadaMarca conserva la foto completa y su proporción. Con más de cuatro
 *     presentaciones usa una cabecera compacta y deja la lista debajo, a todo
 *     el ancho: la cantidad de productos nunca estira ni recorta la imagen;
 *   · el nombre de la marca va al lado o debajo de la foto, nunca encima:
 *     los pósters traen sus propias letras y taparlas arruinaría la portada.
 * Cada presentación sigue abriendo su vista previa con su foto individual.
 */
function TarjetaMarca({ grupo, onVerProducto }) {
  const extensa = esMarcaExtensa(grupo.presentaciones.length)
  return (
    <PortadaMarca marca={grupo.marca} cantidad={grupo.presentaciones.length} className={`catalogo-ficha ${extensa ? 'col-span-full' : 'col-span-2'}`}>
      <ul className={extensa ? 'grid sm:grid-cols-2' : 'divide-y divide-neutro-100 border-t border-neutro-100'}>
        {grupo.presentaciones.map(p => {
          const precio = precioCatalogoAgente(p)
          return <li key={p.id} className={extensa ? 'border-t border-neutro-100 sm:odd:border-r' : ''}>
            <button type="button" onClick={() => onVerProducto(p)} aria-label={`Ver ${p.name}`}
              className="flex min-h-14 w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-primario-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primario-500 sm:px-5">
              <span className="min-w-0 flex-1 break-words text-xs font-semibold leading-5 text-neutro-800 sm:text-sm">{p.name}</span>
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
    </PortadaMarca>
  )
}
export default memo(TarjetaMarca)
