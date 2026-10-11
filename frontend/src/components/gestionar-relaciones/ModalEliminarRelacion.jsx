import { AlertCircle } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'

/**
 * Confirmación para eliminar la relación de un producto (vuelve a estado
 * PENDIENTE). Extraído de GestionarRelaciones.jsx.
 *
 * El botón de eliminar usaba la clase `btn-danger`, que NO está definida en
 * index.css: se veía como un botón cualquiera, sin nada que avisara que la
 * acción es destructiva. Ahora el color sale de la variante `peligro`.
 */
export default function ModalEliminarRelacion({ producto, onConfirmar, onCerrar }) {
  return (
    <Modal
      onCerrar={onCerrar}
      titulo="Confirmar eliminación"
      ancho="lg"
      hoja={false}
      pie={
        <div className="flex gap-3">
          <Boton variante="peligro" onClick={onConfirmar} ancho>Eliminar relación</Boton>
          <Boton variante="secundario" onClick={onCerrar} ancho>Cancelar</Boton>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3 rounded-2xl border border-alerta-200 bg-alerta-50 p-4">
          <AlertCircle className="mt-0.5 shrink-0 text-alerta-600" size={22} />
          <div>
            <p className="mb-1 font-semibold text-alerta-900">¿Está seguro?</p>
            <p className="text-sm text-alerta-800">
              El producto volverá al estado <strong>PENDIENTE</strong> y habrá que relacionarlo de nuevo.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-neutro-50 p-4">
          <h4 className="mb-2 font-semibold text-neutro-900">Producto</h4>
          <p className="text-sm text-neutro-700">{producto.descripcion}</p>
          {producto.mapeo && (
            <p className="mt-2 text-sm text-neutro-600">
              Relacionado con: <strong>{producto.mapeo.productoNombre}</strong>
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
