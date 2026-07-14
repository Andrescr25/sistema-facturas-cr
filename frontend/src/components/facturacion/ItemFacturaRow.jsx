import { X, ChevronUp, FileText } from 'lucide-react'
import { getReference } from '../../utils/facturacionUtils'

/**
 * Fila de un producto agregado a la factura en curso, con variantes
 * móvil (cantidad táctil + detalle colapsable) y desktop (cantidad/precio/
 * descuento/descripción siempre visibles). Extraído de Facturacion.jsx
 * (era el cuerpo del .map de items en "Productos Agregados").
 */
export default function ItemFacturaRow({
  item,
  index,
  isMobile,
  mostrarDetalle,
  onToggleDetalle,
  onEliminar,
  onCambiarCantidad,
  onValidarCantidad,
  onCambiarPrecio,
  onCambiarDescuento,
  onCambiarDescripcion,
  DESCRIPCION_MAX
}) {
  return (
    <div className="border-2 border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`font-bold text-gray-955 leading-snug ${isMobile ? 'text-sm' : 'text-sm md:text-base'}`}>{item.name}</p>
          <p className={`text-gray-500 mt-1 ${isMobile ? 'text-xs' : 'text-xs'}`}>
            Código: <strong>{getReference(item.reference)}</strong>
          </p>
        </div>
        <button
          onClick={() => onEliminar(index)}
          className={`text-red-650 hover:text-red-800 hover:bg-red-50 rounded-xl transition-colors flex-shrink-0 ${isMobile ? 'p-3 hover:bg-red-150' : 'p-2'}`}
          title="Eliminar producto"
        >
          <X size={isMobile ? 24 : 20} strokeWidth={isMobile ? 3 : 2.5} />
        </button>
      </div>

      {isMobile ? (
        <div className="flex flex-col gap-4">
          {/* Fila principal: Cantidad y Subtotal */}
          <div className="flex items-center justify-between gap-4 border-b border-gray-150 pb-3">
            {/* Selector de cantidad táctil gigante */}
            <div>
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">Cantidad</span>
              <div className="flex items-center gap-1 border-2 border-gray-350 rounded-2xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => {
                    const val = parseInt(item.quantity) || 1
                    if (val > 1) {
                      onCambiarCantidad(index, val - 1)
                    }
                  }}
                  className="w-14 h-14 flex items-center justify-center bg-gray-100 active:bg-gray-200 text-gray-800 font-extrabold text-2xl"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => onCambiarCantidad(index, e.target.value)}
                  onBlur={() => onValidarCantidad(index)}
                  className="w-14 text-center font-black text-2xl border-0 focus:ring-0 focus:outline-none p-0"
                  style={{ border: 'none', background: 'transparent' }}
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = parseInt(item.quantity) || 0
                    onCambiarCantidad(index, val + 1)
                  }}
                  className="w-14 h-14 flex items-center justify-center bg-blue-100 active:bg-blue-200 text-blue-800 font-extrabold text-2xl"
                >
                  +
                </button>
              </div>
            </div>

            {/* Precio y Subtotal en grande */}
            <div className="text-right flex flex-col justify-end h-full pt-4">
              <span className="text-xs text-gray-500 block">
                ₡{item.price.toLocaleString('es-CR', { minimumFractionDigits: 2 })} c/u
              </span>
              {item.discount > 0 && (
                <span className="text-xs font-bold text-orange-650 block">
                  Dcto: -{item.discount}%
                </span>
              )}
              <span className="text-lg font-bold text-gray-950 block mt-0.5">
                ₡{((item.quantity * item.price) * (1 - (item.discount || 0) / 100)).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Botón para alternar Opciones Avanzadas en móvil */}
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => onToggleDetalle(item.id)}
              className="text-base font-extrabold text-blue-600 active:text-blue-800 flex items-center gap-1.5 py-2 px-3 bg-blue-50 rounded-xl transition-all"
            >
              {mostrarDetalle ? <ChevronUp size={20} /> : <FileText size={20} />}
              <span>{mostrarDetalle ? 'Ocultar detalle' : 'Agregar detalle / nota'}</span>
            </button>
          </div>

          {/* Opciones Avanzadas colapsables */}
          {mostrarDetalle && (
            <div className="border-t border-dashed border-gray-300 pt-3 mt-1 space-y-4">
              {/* Opciones de precio y descuento comentadas a solicitud del usuario */}
              {/*
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">Precio Unitario</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.price}
                    onChange={(e) => actualizarPrecioItem(index, e.target.value)}
                    className="input w-full text-lg font-bold py-3 px-3 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                    style={{ height: '48px' }}
                    inputMode="decimal"
                  />
                </div>

                <div>
                  <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">Descuento %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={item.discount || 0}
                    onChange={(e) => actualizarDescuentoItem(index, e.target.value)}
                    className="input w-full text-lg font-bold py-3 px-3 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                    style={{ height: '48px' }}
                    inputMode="numeric"
                  />
                </div>
              </div>
              */}

              {/* Detalle o notas */}
              <div>
                <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">Detalle / Notas de línea</label>
                <textarea
                  value={item.description || ''}
                  onChange={(e) => onCambiarDescripcion(index, e.target.value)}
                  maxLength={DESCRIPCION_MAX}
                  rows={2}
                  className="input w-full resize-none text-base py-2.5 px-3 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                  placeholder="Detalle adicional"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {/* Cantidad con botones táctiles grandes */}
            <div>
              <label className="label text-xs font-semibold text-gray-700 uppercase tracking-wider block mb-1">Cantidad</label>
              <div className="flex items-center gap-1 border-2 border-gray-300 rounded-xl overflow-hidden bg-white max-w-[160px]">
                <button
                  type="button"
                  onClick={() => {
                    const val = parseInt(item.quantity) || 1
                    if (val > 1) {
                      onCambiarCantidad(index, val - 1)
                    }
                  }}
                  className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-xl transition-colors flex-shrink-0"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => onCambiarCantidad(index, e.target.value)}
                  onBlur={() => onValidarCantidad(index)}
                  className="w-full text-center font-bold text-lg border-0 focus:ring-0 focus:outline-none p-0"
                  style={{ border: 'none', background: 'transparent' }}
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = parseInt(item.quantity) || 0
                    onCambiarCantidad(index, val + 1)
                  }}
                  className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xl transition-colors flex-shrink-0"
                >
                  +
                </button>
              </div>
            </div>

            {/* Precio */}
            <div>
              <label className="label text-xs font-semibold text-gray-700 uppercase tracking-wider block mb-1">Precio Unitario</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.price}
                onChange={(e) => onCambiarPrecio(index, e.target.value)}
                className="input w-full text-base font-medium py-2 px-3 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                style={{ height: '40px' }}
                inputMode="decimal"
              />
            </div>

            {/* Descuento */}
            <div>
              <label className="label text-xs font-semibold text-gray-700 uppercase tracking-wider block mb-1">Descuento %</label>
              <input
                type="number"
                min="0"
                max="100"
                value={item.discount || 0}
                onChange={(e) => onCambiarDescuento(index, e.target.value)}
                className="input w-full text-base font-medium py-2 px-3 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                style={{ height: '40px' }}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="mt-2">
            <label className="label text-xs font-semibold text-gray-700 uppercase tracking-wider block mb-1">Descripción en factura</label>
            <textarea
              value={item.description || ''}
              onChange={(e) => onCambiarDescripcion(index, e.target.value)}
              maxLength={DESCRIPCION_MAX}
              rows={2}
              className="input w-full resize-none text-sm py-2 px-3 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
              placeholder="Detalle adicional"
            />
          </div>

          <div className="flex justify-between items-center border-t border-gray-200 pt-3 mt-1">
            <span className="text-sm font-semibold text-gray-600">Subtotal Línea:</span>
            <span className="font-bold text-lg text-gray-900">
              ₡{((item.quantity * item.price) * (1 - (item.discount || 0) / 100)).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
