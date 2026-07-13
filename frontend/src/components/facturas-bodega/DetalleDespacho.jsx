import { CalendarDays, CheckCircle, RefreshCw } from 'lucide-react'
import { formatCurrency, formatDate, getItemIdFromFacturaItem } from '../../utils/facturasBodegaUtils'
import ItemFaltanteCard from './ItemFaltanteCard'

/**
 * Detalle del despacho activo: encabezado con progreso de empaque, lista de
 * productos a verificar, y el botón de acción final. Extraído de
 * FacturasBodega.jsx (antes renderDetalle).
 */
export default function DetalleDespacho({
  facturaSeleccionada,
  faltantesDraft,
  checkedItemsCount,
  progressPercent,
  allItemsChecked,
  guardando,
  accionPrincipalLabel,
  onCancelar,
  onMarcarModo,
  onCambiarCantidad,
  onCambiarObservacion,
  onRegistrarFaltantes
}) {
  return (
    <div className="space-y-4 pb-24">
      {/* Encabezado Fijo del Despacho Activo */}
      <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <button
            className="text-gray-500 flex items-center gap-1.5 text-sm hover:text-gray-800 font-semibold"
            onClick={onCancelar}
          >
            ← Cancelar y salir
          </button>
          <span className="text-xs text-gray-400">Despacho Activo</span>
        </div>

        <div className="flex items-start justify-between border-t pt-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 whitespace-normal break-words leading-tight">{facturaSeleccionada.cliente_nombre}</h2>
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <CalendarDays size={12} />
              Emitido: {formatDate(facturaSeleccionada.fecha_emision)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-base font-bold text-blue-600">#{facturaSeleccionada.numero_completo || facturaSeleccionada.numero_factura}</p>
            <p className="text-xs text-gray-400">Total: {formatCurrency(facturaSeleccionada.total)}</p>
          </div>
        </div>

        {/* Barra de Progreso del Picking */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between items-center text-xs font-semibold">
            <span className="text-gray-500">Progreso del empaque:</span>
            <span className={progressPercent === 100 ? 'text-green-600' : 'text-blue-600'}>
              {checkedItemsCount} de {facturaSeleccionada.items?.length || 0} productos ({progressPercent}%)
            </span>
          </div>
          <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${progressPercent === 100 ? 'bg-green-500 shadow-sm shadow-green-200' : 'bg-blue-600'
                }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Lista de productos para verificar */}
      <div className="space-y-3">
        {facturaSeleccionada.items?.map((item, index) => {
          const key = getItemIdFromFacturaItem(item) || `item-${index}`
          const draft = faltantesDraft[key]
          const cantidadFactura = Number(item?.cantidad ?? item?.quantity ?? 0)

          return (
            <ItemFaltanteCard
              key={`${key}-${index}`}
              item={item}
              draft={draft}
              cantidadFactura={cantidadFactura}
              onMarcarModo={(modo) => onMarcarModo(key, modo, cantidadFactura)}
              onCambiarCantidad={(valor) => onCambiarCantidad(key, valor, cantidadFactura)}
              onCambiarObservacion={(texto) => onCambiarObservacion(key, texto)}
            />
          )
        })}
      </div>

      {/* Barra de Acciones al final de la página */}
      <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm flex flex-col gap-2 mt-4">
        <button
          onClick={onRegistrarFaltantes}
          disabled={guardando || !facturaSeleccionada || !allItemsChecked}
          className={`w-full py-4 rounded-2xl text-base font-bold text-white transition-all shadow-lg text-center flex items-center justify-center gap-2 ${!allItemsChecked
            ? 'bg-gray-300 cursor-not-allowed shadow-none'
            : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200 active:scale-[0.98]'
            }`}
        >
          {guardando ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <CheckCircle size={18} />
              {accionPrincipalLabel}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
