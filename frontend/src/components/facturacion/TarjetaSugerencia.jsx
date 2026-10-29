import { Plus, Package } from 'lucide-react'
import { urlArchivo } from '../../utils/urlArchivo'
import { textoMotivo } from '../../utils/sugerenciasFacturacion'

/**
 * Un producto sugerido: foto, nombre, por qué se sugiere y "Agregar".
 *
 * `compacta` es la de la fila (ancho fijo, no se encoge para poder desplazarla);
 * sin ella la tarjeta ocupa la celda de la cuadrícula del «Ver más».
 */
export default function TarjetaSugerencia({ producto: p, onAgregar, compacta = false }) {
  return (
    <button
      type="button"
      onClick={() => onAgregar(p)}
      title={`Agregar ${p.nombre}`}
      className={`group flex flex-col gap-1.5 rounded-xl border border-neutro-200 bg-white p-2 text-left transition-colors hover:border-acento-300 hover:bg-acento-50/40 ${compacta ? 'w-36 shrink-0' : 'w-full min-w-0'}`}
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
        {textoMotivo(p)}
      </p>

      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-acento-600">
        <Plus size={11} />Agregar
      </span>
    </button>
  )
}
