import { X, ImageIcon } from 'lucide-react'
import { useModal } from '../../hooks/useModal'
import { urlArchivo } from '../../utils/urlArchivo'

/**
 * Modal de solo lectura: muestra la foto que el producto ya tiene guardada
 * en el catálogo (o el estado "Sin Imagen"), para que el personal de bodega
 * pueda confirmar que está contando el producto correcto. No permite subir
 * ni cambiar imágenes — eso vive en Gestión de Catálogo.
 */
export default function ModalImagenProducto({ item, onCerrar }) {
  useModal(onCerrar)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutro-900/60 backdrop-blur-sm"
      onClick={onCerrar}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-neutro-100 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-5 border-b border-neutro-100 bg-neutro-50">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-neutro-900 line-clamp-1">{item.nombre_producto}</h3>
            <p className="text-xs text-neutro-500 mt-0.5">Ref: {item.referencia || 'N/A'}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-2 text-neutro-400 hover:text-neutro-600 rounded-lg hover:bg-neutro-100 shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex items-center justify-center bg-neutro-50 min-h-[280px]">
          {item.image_url ? (
            <img
              src={urlArchivo(item.image_url)}
              alt={item.nombre_producto}
              className="object-contain max-h-[60vh] w-full rounded-lg"
              loading="lazy"
            />
          ) : (
            <div className="border-2 border-dashed border-peligro-200 rounded-xl w-full h-56 flex flex-col items-center justify-center p-4 text-center">
              <ImageIcon className="h-10 w-10 text-peligro-300 mb-2" />
              <span className="text-xs uppercase tracking-wider font-extrabold text-peligro-500 bg-peligro-50 px-2 py-0.5 rounded-full border border-peligro-100">
                Sin Imagen
              </span>
              <span className="text-xs text-neutro-400 mt-2 max-w-xs">
                Este producto no tiene foto asignada en el catálogo.
              </span>
            </div>
          )}
        </div>

        <div className="p-4 bg-neutro-50 border-t border-neutro-100 flex justify-end">
          <button
            type="button"
            onClick={onCerrar}
            className="px-4 py-2 border border-neutro-200 rounded-lg text-sm text-neutro-600 font-semibold hover:bg-neutro-100 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
