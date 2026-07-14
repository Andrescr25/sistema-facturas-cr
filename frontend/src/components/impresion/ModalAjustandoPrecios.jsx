import { Loader } from 'lucide-react'

/**
 * Overlay de carga mientras se ajustan precios/se procesa la factura en
 * Alegra. Extraído de Impresion.jsx.
 */
export default function ModalAjustandoPrecios({ mensaje }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl text-center space-y-4">
        <Loader className="mx-auto text-blue-600 animate-spin" size={40} />
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {mensaje}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Actualizando precios desde Alegra...
          </p>
        </div>
      </div>
    </div>
  )
}
