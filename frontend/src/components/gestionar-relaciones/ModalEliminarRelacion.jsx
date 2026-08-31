import { AlertCircle, XCircle } from 'lucide-react'

/**
 * Modal de confirmación para eliminar la relación de un producto (vuelve a
 * estado PENDIENTE). Extraído de GestionarRelaciones.jsx.
 */
export default function ModalEliminarRelacion({ producto, onConfirmar, onCerrar }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-neutro-900">Confirmar Eliminación</h3>
            <button
              onClick={onCerrar}
              className="text-neutro-500 hover:text-neutro-700"
            >
              <XCircle size={24} />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-alerta-50 border border-alerta-200 rounded-lg p-4 mb-4">
            <div className="flex items-start">
              <AlertCircle className="text-alerta-600 mr-3 flex-shrink-0" size={24} />
              <div>
                <p className="font-semibold text-alerta-900 mb-1">¿Estás seguro?</p>
                <p className="text-sm text-alerta-800">
                  El producto volverá al estado <strong>PENDIENTE</strong> y tendrás que relacionarlo nuevamente.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-neutro-50 rounded-lg p-4 mb-4">
            <h4 className="font-semibold text-neutro-900 mb-2">Producto:</h4>
            <p className="text-sm text-neutro-700">{producto.descripcion}</p>
            {producto.mapeo && (
              <p className="text-sm text-neutro-600 mt-2">
                Relacionado con: <strong>{producto.mapeo.alegraName}</strong>
              </p>
            )}
          </div>
        </div>

        <div className="p-6 border-t bg-neutro-50 flex gap-3">
          <button
            onClick={onConfirmar}
            className="btn btn-danger flex-1"
          >
            Eliminar Relación
          </button>
          <button
            onClick={onCerrar}
            className="btn btn-outline flex-1"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
