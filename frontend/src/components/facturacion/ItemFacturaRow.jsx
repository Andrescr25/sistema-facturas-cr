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
    <div className="border-2 border-neutro-200 rounded-xl p-4 bg-neutro-50 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`font-bold text-neutro-950 leading-snug ${isMobile ? 'text-sm' : 'text-sm md:text-base'}`}>{item.name}</p>
          <p className={`text-neutro-500 mt-1 ${isMobile ? 'text-xs' : 'text-xs'}`}>
            Código: <strong>{getReference(item.reference)}</strong>
          </p>
        </div>
        <button
          onClick={() => onEliminar(index)}
          className={`text-peligro-600 hover:text-peligro-800 hover:bg-peligro-50 rounded-xl transition-colors flex-shrink-0 ${isMobile ? 'p-3 hover:bg-peligro-200' : 'p-2'}`}
          title="Eliminar producto"
        >
          <X size={isMobile ? 24 : 20} strokeWidth={isMobile ? 3 : 2.5} />
        </button>
      </div>

      {isMobile ? (
        <div className="flex flex-col gap-4">
          {/* Fila principal: Cantidad y Subtotal */}
          <div className="flex items-center justify-between gap-4 border-b border-neutro-200 pb-3">
            {/* Selector de cantidad táctil gigante */}
            <div>
              <span className="text-xs font-bold text-neutro-700 uppercase tracking-wider block mb-1.5">Cantidad</span>
              <div className="flex items-center gap-1 border-2 border-neutro-300 rounded-2xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => {
                    const val = parseInt(item.quantity) || 1
                    if (val > 1) {
                      onCambiarCantidad(index, val - 1)
                    }
                  }}
                  className="w-14 h-14 flex items-center justify-center bg-neutro-100 active:bg-neutro-200 text-neutro-800 font-extrabold text-2xl"
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
                  className="w-14 h-14 flex items-center justify-center bg-primario-100 active:bg-primario-200 text-primario-800 font-extrabold text-2xl"
                >
                  +
                </button>
              </div>
            </div>

            {/* Precio y Subtotal en grande */}
            <div className="text-right flex flex-col justify-end h-full pt-4">
              <span className="text-xs text-neutro-500 block">
                ₡{item.price.toLocaleString('es-CR', { minimumFractionDigits: 2 })} c/u
              </span>
              {item.discount > 0 && (
                <span className="text-xs font-bold text-alerta-600 block">
                  Dcto: -{item.discount}%
                </span>
              )}
              <span className="text-lg font-bold text-neutro-950 block mt-0.5">
                ₡{((item.quantity * item.price) * (1 - (item.discount || 0) / 100)).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Botón para alternar Opciones Avanzadas en móvil */}
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => onToggleDetalle(item.id)}
              className="text-base font-extrabold text-primario-600 active:text-primario-800 flex items-center gap-1.5 py-2 px-3 bg-primario-50 rounded-xl transition-all"
            >
              {mostrarDetalle ? <ChevronUp size={20} /> : <FileText size={20} />}
              <span>{mostrarDetalle ? 'Ocultar detalle' : 'Agregar detalle / nota'}</span>
            </button>
          </div>

          {/* Opciones Avanzadas colapsables */}
          {mostrarDetalle && (
            <div className="border-t border-dashed border-neutro-300 pt-3 mt-1 space-y-4">
              {/* Opciones de precio y descuento comentadas a solicitud del usuario */}
              {/*
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs font-bold text-neutro-700 uppercase tracking-wider block mb-1">Precio Unitario</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.price}
                    onChange={(e) => actualizarPrecioItem(index, e.target.value)}
                    className="input w-full text-lg font-bold py-3 px-3 border-2 border-neutro-300 focus:border-primario-500 rounded-xl"
                    style={{ height: '48px' }}
                    inputMode="decimal"
                  />
                </div>

                <div>
                  <label className="label text-xs font-bold text-neutro-700 uppercase tracking-wider block mb-1">Descuento %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={item.discount || 0}
                    onChange={(e) => actualizarDescuentoItem(index, e.target.value)}
                    className="input w-full text-lg font-bold py-3 px-3 border-2 border-neutro-300 focus:border-primario-500 rounded-xl"
                    style={{ height: '48px' }}
                    inputMode="numeric"
                  />
                </div>
              </div>
              */}

              {/* Detalle o notas */}
              <div>
                <label className="label text-xs font-bold text-neutro-700 uppercase tracking-wider block mb-1">Detalle / Notas de línea</label>
                <textarea
                  value={item.description || ''}
                  onChange={(e) => onCambiarDescripcion(index, e.target.value)}
                  maxLength={DESCRIPCION_MAX}
                  rows={2}
                  className="input w-full resize-none text-base py-2.5 px-3 border-2 border-neutro-300 focus:border-primario-500 rounded-xl"
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
              <label className="label text-xs font-semibold text-neutro-700 uppercase tracking-wider block mb-1">Cantidad</label>
              <div className="flex items-center gap-1 border-2 border-neutro-300 rounded-xl overflow-hidden bg-white max-w-[160px]">
                <button
                  type="button"
                  onClick={() => {
                    const val = parseInt(item.quantity) || 1
                    if (val > 1) {
                      onCambiarCantidad(index, val - 1)
                    }
                  }}
                  className="w-10 h-10 flex items-center justify-center bg-neutro-100 hover:bg-neutro-200 active:bg-neutro-300 text-neutro-800 font-bold text-xl transition-colors flex-shrink-0"
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
                  className="w-10 h-10 flex items-center justify-center bg-primario-600 hover:bg-primario-700 active:bg-primario-800 text-white font-bold text-xl transition-colors flex-shrink-0"
                >
                  +
                </button>
              </div>
            </div>

            {/* Precio */}
            <div>
              <label className="label text-xs font-semibold text-neutro-700 uppercase tracking-wider block mb-1">Precio Unitario</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.price}
                onChange={(e) => onCambiarPrecio(index, e.target.value)}
                className="input w-full text-base font-medium py-2 px-3 border-2 border-neutro-300 focus:border-primario-500 rounded-xl"
                style={{ height: '40px' }}
                inputMode="decimal"
              />
            </div>

            {/* Descuento */}
            <div>
              <label className="label text-xs font-semibold text-neutro-700 uppercase tracking-wider block mb-1">Descuento %</label>
              <input
                type="number"
                min="0"
                max="100"
                value={item.discount || 0}
                onChange={(e) => onCambiarDescuento(index, e.target.value)}
                className="input w-full text-base font-medium py-2 px-3 border-2 border-neutro-300 focus:border-primario-500 rounded-xl"
                style={{ height: '40px' }}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="mt-2">
            <label className="label text-xs font-semibold text-neutro-700 uppercase tracking-wider block mb-1">Descripción en factura</label>
            <textarea
              value={item.description || ''}
              onChange={(e) => onCambiarDescripcion(index, e.target.value)}
              maxLength={DESCRIPCION_MAX}
              rows={2}
              className="input w-full resize-none text-sm py-2 px-3 border-2 border-neutro-300 focus:border-primario-500 rounded-xl"
              placeholder="Detalle adicional"
            />
          </div>

          <div className="flex justify-between items-center border-t border-neutro-200 pt-3 mt-1">
            <span className="text-sm font-semibold text-neutro-600">Subtotal Línea:</span>
            <span className="font-bold text-lg text-neutro-900">
              ₡{((item.quantity * item.price) * (1 - (item.discount || 0) / 100)).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
