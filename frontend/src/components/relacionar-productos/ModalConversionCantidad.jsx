import { AlertCircle } from 'lucide-react'
import { calcularVistaPreviaConversion } from '../../utils/relacionarProductosUtils'

/**
 * Modal para configurar el factor de conversión entre la cantidad que
 * factura el proveedor y la cantidad equivalente en el sistema propio,
 * justo después de relacionar (o al editar el factor luego). Extraído de
 * RelacionarProductos.jsx.
 */
export default function ModalConversionCantidad({
  productoRelacionado,
  cantidadProveedor,
  setCantidadProveedor,
  cantidadMia,
  setCantidadMia,
  onGuardar,
  onOmitir
}) {
  const { cantProv, cantMia, factor, ejemplo1Prov, ejemplo1Mia, ejemplo2Prov, ejemplo2Mia } =
    calcularVistaPreviaConversion(cantidadProveedor, cantidadMia)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-xl border border-neutro-100 flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-neutro-50 flex-shrink-0 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-neutro-900">Configurar Conversión de Cantidad</h3>
            <p className="text-xs text-neutro-500 mt-0.5">
              Define cómo convertir las cantidades entre el proveedor y tu sistema
            </p>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Info de productos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-alerta-50/50 p-4 rounded-2xl border border-alerta-100/70">
              <p className="text-xxs font-bold text-alerta-700 mb-1.5 uppercase tracking-wider">PROVEEDOR</p>
              <p className="font-semibold text-neutro-900 text-sm leading-snug">{productoRelacionado.descripcion}</p>
              <p className="text-xs text-neutro-600 mt-1">
                Cantidad: <span className="font-semibold text-neutro-800">{productoRelacionado.cantidad} {productoRelacionado.unidadMedida}</span>
              </p>
            </div>
            <div className="bg-primario-50/50 p-4 rounded-2xl border border-primario-100/70">
              <p className="text-xxs font-bold text-primario-700 mb-1.5 uppercase tracking-wider">TU SISTEMA</p>
              <p className="font-semibold text-neutro-900 text-sm leading-snug">{productoRelacionado.productoElegido.name}</p>
              <p className="text-xs text-neutro-600 mt-1">
                Ref: <span className="font-mono text-neutro-800">{productoRelacionado.productoElegido.reference || 'N/A'}</span>
              </p>
            </div>
          </div>

          {/* Opciones de conversión */}
          <div className="space-y-4">
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

            {/* Ejemplos dinámicos */}
            <div className="bg-neutro-50/70 p-5 rounded-2xl border border-neutro-100 space-y-3">
              <p className="text-xs font-bold text-neutro-700 uppercase tracking-wider">Vista Previa</p>
              <div className="space-y-3 text-sm text-neutro-600">
                <p className="bg-primario-50/40 p-2.5 rounded-lg border border-primario-50/60 text-xs">
                  <strong>Configuración:</strong> {cantProv} del proveedor = {cantMia} en tu sistema
                </p>
                <p className="text-xs text-neutro-500 bg-neutro-100/60 p-2 rounded-lg font-mono">
                  Factor de conversión: <strong>{factor.toFixed(6)}</strong>
                </p>
                <div className="bg-exito-50/40 p-3 rounded-xl border border-exito-100">
                  <p className="text-xs text-exito-800 font-bold mb-2">
                    Este factor se aplicará automáticamente
                  </p>
                  <div className="space-y-1 text-xs text-neutro-700 font-mono">
                    <p>• Proveedor factura <strong>{ejemplo2Prov}</strong> → Tú verás <strong>{ejemplo2Mia}</strong></p>
                    <p>• Proveedor factura <strong>{ejemplo1Prov}</strong> → Tú verás <strong>{ejemplo1Mia}</strong></p>
                  </div>
                </div>

                {/* Casos comunes */}
                {cantProv === 24 && cantMia === 12 && (
                  <p className="text-xs text-exito-800 bg-exito-50/50 p-2 rounded-lg font-medium">
                    Caso común: Proveedor vende 1x24, tú vendes 1x12
                  </p>
                )}
                {cantProv === 100 && cantMia === 1 && (
                  <p className="text-xs text-exito-800 bg-exito-50/50 p-2 rounded-lg font-medium">
                    Caso común: Proveedor vende 100 unidades sueltas, tú vendes 1x100
                  </p>
                )}
                {cantProv === 1 && cantMia === 24 && (
                  <p className="text-xs text-exito-800 bg-exito-50/50 p-2 rounded-lg font-medium">
                    Caso común: Proveedor vende 1 caja, tú vendes 24 unidades
                  </p>
                )}
                {cantProv === cantMia && (
                  <p className="text-xs text-neutro-500 bg-neutro-100/40 p-2 rounded-lg font-medium">
                    Sin conversión: Las cantidades son iguales (1:1)
                  </p>
                )}
              </div>
            </div>

            {/* Advertencia */}
            {parseFloat(cantidadProveedor) !== parseFloat(cantidadMia) && (
              <div className="bg-alerta-50/50 p-3 rounded-xl border border-alerta-200 flex items-start">
                <AlertCircle className="text-alerta-600 mr-2 flex-shrink-0 mt-0.5" size={16} />
                <div className="text-xs text-alerta-800 leading-normal">
                  <p className="font-bold mb-0.5">Importante:</p>
                  <p>Se aplicará automáticamente en futuras facturas de este proveedor.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Botones */}
        <div className="p-6 border-t border-neutro-50 bg-neutro-50/50 flex gap-3 flex-shrink-0">
          <button
            onClick={onGuardar}
            className="px-5 py-3 bg-primario-600 hover:bg-primario-700 text-white font-bold rounded-xl text-sm shadow-sm active:scale-[0.98] transition flex-1"
          >
            Guardar Conversión
          </button>
          <button
            onClick={onOmitir}
            className="px-5 py-3 border border-neutro-200 hover:bg-neutro-50 text-neutro-700 font-semibold rounded-xl text-sm transition flex-1"
          >
            Omitir (1:1)
          </button>
        </div>
      </div>
    </div>
  )
}
