import { Edit, X } from 'lucide-react'

/**
 * Banner naranja que indica que se está editando una factura existente.
 * Extraído de Facturacion.jsx.
 */
export default function BannerModoEdicion({ isMobile, facturaEditando, onCancelar }) {
  return (
    <div className={`${isMobile ? 'px-4 mb-4' : 'mb-6'}`}>
      <div className="bg-orange-50 border-l-4 border-orange-600 p-4 rounded-r-lg">
        <div className="flex items-center gap-3">
          <Edit className="text-orange-600" size={24} />
          <div className="flex-1">
            <p className="font-semibold text-orange-900">
              Editando Factura #{facturaEditando.numberTemplate?.fullNumber || facturaEditando.id}
            </p>
            <p className="text-sm text-orange-700">
              Realiza los cambios necesarios y guarda cuando termines
            </p>
          </div>
          <button
            onClick={onCancelar}
            className="text-orange-600 hover:text-orange-800 p-2"
            title="Cancelar edición"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
