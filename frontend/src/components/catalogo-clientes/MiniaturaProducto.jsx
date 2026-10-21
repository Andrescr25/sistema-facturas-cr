import { Package } from 'lucide-react'
import { urlArchivo } from '../../utils/urlArchivo'

/**
 * La foto chica de un producto en las listas del pedido, la compra anterior
 * y las sugerencias. Sin foto, o si no carga, queda la caja con el ícono:
 * nunca el ícono roto del navegador. El tamaño lo pone quien la usa.
 */
export default function MiniaturaProducto({ imagen, className = 'w-11 h-11 shrink-0' }) {
  return (
    <div className={`${className} bg-neutro-50 rounded-lg flex items-center justify-center overflow-hidden`}>
      {imagen
        ? <img src={urlArchivo(imagen)} alt="" loading="lazy" className="w-full h-full object-contain"
               onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
        : <Package size={16} className="text-neutro-300" />}
    </div>
  )
}
