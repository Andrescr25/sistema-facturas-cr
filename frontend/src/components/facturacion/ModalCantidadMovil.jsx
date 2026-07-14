import { Minus, Plus, Check, Package } from 'lucide-react'
import { getReference } from '../../utils/facturacionUtils'

/**
 * Modal de selección de cantidad optimizado para táctil (móvil), usado al
 * elegir un producto desde la búsqueda por nombre. Extraído de
 * Facturacion.jsx.
 */
export default function ModalCantidadMovil({
  producto,
  cantidad,
  setCantidad,
  cantidadInputRef,
  onCerrar,
  onConfirmar
}) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        className="bg-white rounded-3xl sm:rounded-xl shadow-2xl w-full sm:max-w-md p-6 animate-slideUp"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: '90vh',
          marginBottom: 'env(safe-area-inset-bottom, 0px)'
        }}
      >
        {/* Handle visual para drag (solo móvil) */}
        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden"></div>

        {/* Producto seleccionado */}
        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-900 mb-2 leading-tight">
            {producto.name}
          </h3>
          <p className="text-sm text-gray-600 flex items-center gap-2">
            <Package size={14} />
            {getReference(producto.reference)}
          </p>
          {producto.price && (
            <p className="text-xl font-bold text-green-600 mt-2">
              ₡{producto.price.toLocaleString()}
            </p>
          )}
        </div>

        {/* Input de cantidad con botones + y - */}
        <div className="mb-6">
          <label className="block text-lg font-semibold text-gray-900 mb-4">
            Cantidad
          </label>

          <div className="flex items-center gap-3 justify-center flex-nowrap">
            {/* Botón menos */}
            <button
              type="button"
              onClick={() => {
                const current = parseInt(cantidad) || 1
                if (current > 1) setCantidad((current - 1).toString())
              }}
              className="w-16 h-16 flex-shrink-0 flex items-center justify-center bg-gray-200 hover:bg-gray-300 active:bg-gray-400 rounded-2xl text-gray-700 font-extrabold text-3xl transition-colors"
            >
              <Minus size={28} />
            </button>

            {/* Input numérico envuelto en contenedor de tamaño fijo */}
            <div className="w-16 h-16 flex-shrink-0">
              <input
                ref={cantidadInputRef}
                type="number"
                min="1"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                onFocus={(e) => {
                  e.target.select()
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onConfirmar()
                  }
                }}
                placeholder="1"
                className="w-full h-full text-center text-2xl font-black border-2 border-gray-350 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-200 focus:outline-none"
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </div>

            {/* Botón más */}
            <button
              type="button"
              onClick={() => {
                const current = parseInt(cantidad) || 0
                setCantidad((current + 1).toString())
              }}
              className="w-16 h-16 flex-shrink-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-2xl text-white font-extrabold text-3xl transition-colors"
            >
              <Plus size={28} />
            </button>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={onCerrar}
            className="flex-1 py-5 px-4 bg-gray-200 text-gray-800 rounded-2xl font-black hover:bg-gray-300 active:bg-gray-400 transition-colors text-lg"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={!cantidad || parseInt(cantidad) <= 0}
            className="flex-1 py-5 px-4 bg-green-600 text-white rounded-2xl font-black hover:bg-green-700 active:bg-green-800 transition-colors disabled:bg-gray-350 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg shadow-xl"
          >
            <Check size={26} strokeWidth={3} />
            Agregar
          </button>
        </div>
      </div>
    </div>
  )
}
