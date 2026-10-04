import { XCircle } from 'lucide-react'
import { calcularFactorConversion } from '../../utils/gestionarRelacionesUtils'
import { useModal } from '../../hooks/useModal'

/**
 * Modal para definir el factor de conversión (equivalencia de cantidades)
 * entre lo que factura el proveedor y lo que se registra en el sistema
 * propio, con vista previa en vivo. Extraído de GestionarRelaciones.jsx.
 */
export default function ModalFactorConversion({
  producto,
  cantidadProveedor,
  setCantidadProveedor,
  cantidadMia,
  setCantidadMia,
  onGuardar,
  onCerrar
}) {
  useModal(onCerrar)
  const cantProv = parseFloat(cantidadProveedor) || 1
  const cantMia = parseFloat(cantidadMia) || 1
  const factor = calcularFactorConversion(cantProv, cantMia)
  const ejemploProveedor = 10
  const ejemploResultado = (ejemploProveedor * factor).toFixed(2)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-xl border border-neutro-100 flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-neutro-50 flex-shrink-0 flex items-center justify-between">
          <h3 className="text-lg font-bold text-neutro-900">Factor de Conversión</h3>
          <button
            onClick={onCerrar}
            className="text-neutro-400 hover:text-neutro-600 transition"
          >
            <XCircle size={22} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-grow">
          {/* Info del producto */}
          <div className="bg-neutro-50/70 p-5 rounded-2xl border border-neutro-100">
            <p className="text-xxs font-bold uppercase tracking-wider text-neutro-400 mb-1.5">Producto del proveedor</p>
            <p className="font-semibold text-neutro-900 text-sm leading-snug">{producto.descripcion}</p>
            <p className="text-xs text-neutro-500 mt-1">Relacionado con: <span className="font-medium text-neutro-700">{producto.mapeo?.productoNombre}</span></p>
          </div>

          <div className="bg-primario-50/50 p-5 rounded-2xl border border-primario-100/70">
            <p className="text-xs font-bold text-primario-800 uppercase tracking-wider mb-4">
              Define la equivalencia entre las cantidades
            </p>

            <div className="grid grid-cols-5 gap-3 items-center">
              {/* Cantidad Proveedor */}
              <div className="col-span-2 space-y-1">
                <label className="block text-xxs font-bold text-neutro-500 uppercase">Cantidad Proveedor</label>
                <input
                  type="number"
                  value={cantidadProveedor}
                  onChange={(e) => setCantidadProveedor(e.target.value)}
                  step="1"
                  min="1"
                  className="input w-full rounded-xl border-neutro-200 text-sm py-2"
                  placeholder="Ej: 24"
                />
                <p className="text-[10px] text-neutro-400 font-medium">Unidades que factura</p>
              </div>

              {/* Icono = */}
              <div className="col-span-1 text-center pt-3">
                <span className="text-xl text-primario-600 font-black">=</span>
              </div>

              {/* Cantidad Mía */}
              <div className="col-span-2 space-y-1">
                <label className="block text-xxs font-bold text-neutro-500 uppercase">Cantidad en Tu Sistema</label>
                <input
                  type="number"
                  value={cantidadMia}
                  onChange={(e) => setCantidadMia(e.target.value)}
                  step="1"
                  min="1"
                  className="input w-full rounded-xl border-neutro-200 text-sm py-2"
                  placeholder="Ej: 12"
                />
                <p className="text-[10px] text-neutro-400 font-medium">Unidades que registras</p>
              </div>
            </div>
          </div>

          {/* Vista Previa */}
          <div className="bg-neutro-50/70 p-5 rounded-2xl border border-neutro-100 space-y-2">
            <p className="text-xs font-bold text-neutro-700 uppercase tracking-wider">Vista Previa</p>
            <div className="text-sm text-neutro-600 space-y-1 leading-relaxed">
              <p>
                <strong>Configuración:</strong> {cantProv} del proveedor = {cantMia} en tu sistema
              </p>
              <p className="text-primario-700 font-medium bg-primario-50/40 p-2 rounded-lg border border-primario-50/60 mt-1.5 text-xs">
                <strong>Ejemplo:</strong> Si el proveedor factura <strong>{ejemploProveedor}</strong>,
                en tu sistema se registrarán <strong>{ejemploResultado}</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-neutro-50 bg-neutro-50/50 flex gap-3 flex-shrink-0">
          <button
            onClick={onGuardar}
            className="px-5 py-3 bg-primario-600 hover:bg-primario-700 text-white font-bold rounded-xl text-sm shadow-sm active:scale-[0.98] transition flex-1"
          >
            Guardar Factor
          </button>
          <button
            onClick={onCerrar}
            className="px-5 py-3 border border-neutro-200 hover:bg-neutro-50 text-neutro-700 font-semibold rounded-xl text-sm transition flex-1"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
