import { Check, X, Edit } from 'lucide-react'

/**
 * Resumen de totales (subtotal/descuento/impuestos/total) y los botones de
 * finalizar/cancelar la factura. Extraído de Facturacion.jsx.
 */
export default function ResumenTotales({
  isMobile,
  items,
  descuentoGlobal,
  impuestoPrincipal,
  subtotal,
  impuestosTotal,
  descuentoTotal,
  total,
  modoEdicion,
  loading,
  clienteSeleccionado,
  onFinalizar,
  onCancelar
}) {
  return (
    <>
      {/* Header del resumen - Solo desktop */}
      {!isMobile && <h3 className="text-lg font-semibold mb-4">Resumen</h3>}

      {/* Totales compactos en móvil */}
      <div className={`${isMobile ? 'space-y-1 mb-3' : 'space-y-2 mb-4'}`}>
        {!isMobile && (
          <>
            <div className="flex justify-between text-neutro-700">
              <span>Subtotal:</span>
              <span className="font-medium">₡{subtotal.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
            </div>

            {descuentoGlobal > 0 && (
              <div className="flex justify-between text-alerta-600">
                <span>Descuento ({descuentoGlobal}%):</span>
                <span className="font-medium">-₡{descuentoTotal.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            <div className="flex justify-between text-neutro-700">
              <span>
                {impuestoPrincipal
                  ? `${impuestoPrincipal.name || 'Impuestos'} (${Number(impuestoPrincipal.percentage) || 0}%)`
                  : 'Impuestos estimados'}:
              </span>
              <span className="font-medium">
                ₡{impuestosTotal.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </>
        )}

        {/* Total - Siempre visible */}
        <div className={`${isMobile ? 'py-2' : 'border-t-2 border-neutro-300 pt-2'
          } flex justify-between ${isMobile ? 'text-lg' : 'text-xl'} font-bold text-neutro-900`}>
          <div>
            <span className={isMobile ? 'text-sm text-neutro-600 block' : ''}>
              {isMobile && `${items.length} ${items.length === 1 ? 'producto' : 'productos'} •`}
            </span>
            <span>TOTAL:</span>
          </div>
          <span className="text-exito-600">₡{total.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Botones de acción */}
      <div className={`${isMobile ? 'space-y-2' : 'space-y-2'}`}>
        <button
          onClick={onFinalizar}
          disabled={!clienteSeleccionado || items.length === 0 || loading}
          className={`btn ${modoEdicion ? 'bg-alerta-600 hover:bg-alerta-700' : 'btn-primary'} w-full flex items-center justify-center gap-2 ${isMobile ? 'py-4 text-lg font-bold shadow-lg' : ''
            }`}
        >
          {modoEdicion ? <Edit size={isMobile ? 24 : 20} /> : <Check size={isMobile ? 24 : 20} />}
          {loading ? 'Procesando...' : (modoEdicion ? (isMobile ? 'Guardar Cambios' : 'Guardar Cambios') : (isMobile ? 'Finalizar' : 'Finalizar Factura'))}
        </button>

        <button
          onClick={onCancelar}
          className="btn btn-outline w-full flex items-center justify-center gap-2"
        >
          <X size={20} />
          Cancelar
        </button>
      </div>
    </>
  )
}
