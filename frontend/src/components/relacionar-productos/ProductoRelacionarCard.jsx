import { Check, Link2, Settings } from 'lucide-react'

/**
 * Tarjeta de un producto de la factura con su estado de relación y las
 * acciones (relacionar / cambiar / editar factor). Extraído de
 * RelacionarProductos.jsx (era el cuerpo del .map de productos).
 */
export default function ProductoRelacionarCard({ producto, alegraInfo, onRelacionar, onCambiarRelacion, onEditarFactor }) {
  return (
    <div className="card border border-gray-150 hover:shadow-md transition bg-white p-5 rounded-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center flex-wrap gap-2.5">
            <h3 className="font-bold text-gray-900 text-base leading-snug">
              {producto.descripcion}
            </h3>
            <span className={`px-2 py-0.5 text-xxs font-bold uppercase rounded-full tracking-wider ${
              producto.estadoRelacionado === 'RELACIONADO'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : 'bg-amber-50 text-amber-700 border border-amber-100'
            }`}>
              {producto.estadoRelacionado === 'RELACIONADO' ? 'Relacionado' : 'Sin Relacionar'}
            </span>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-gray-500 font-medium">
            <span>
              Código:
              <span className={producto.codigoProveedor?.startsWith('DESC-') ? 'text-orange-600 font-mono ml-1 font-bold' : 'ml-1 font-mono text-gray-800'}>
                {producto.codigoProveedor}
              </span>
              {producto.codigoProveedor?.startsWith('DESC-') && (
                <span className="ml-1 text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-full font-bold" title="Código generado automáticamente porque el proveedor no envía código interno">
                  Auto-generado
                </span>
              )}
            </span>
            <span>&bull;</span>
            <span>Cantidad: <strong className="text-gray-800">{producto.cantidad} {producto.unidadMedida}</strong></span>
            <span>&bull;</span>
            <span>Precio: <strong className="text-gray-800">₡{producto.precioUnitario?.toLocaleString('es-CR')}</strong></span>
          </div>

          {/* Info del producto relacionado */}
          {producto.estadoRelacionado === 'RELACIONADO' && alegraInfo && (
            <div className="mt-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-xxs font-bold uppercase tracking-wider text-emerald-600 mb-1.5">
                    Relacionado con Alegra
                  </div>
                  <p className="font-semibold text-emerald-950 text-sm leading-snug">{alegraInfo.name}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-emerald-800 mt-2 font-mono">
                    <span>Ref: {alegraInfo.reference || 'N/A'}</span>
                    <span>&bull;</span>
                    <span>Precio Venta: ₡{alegraInfo.price?.toLocaleString('es-CR')}</span>
                    {alegraInfo.factorConversion && alegraInfo.factorConversion !== 1 && (
                      <>
                        <span>&bull;</span>
                        <span className="text-blue-700 font-bold">
                          Factor: {alegraInfo.factorConversion}x
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {producto.estadoRelacionado === 'RELACIONADO' && !alegraInfo && (
            <div className="mt-2 text-xs text-emerald-600 flex items-center font-semibold">
              <Check size={14} className="mr-1" />
              Relacionado (cargando información...)
            </div>
          )}
        </div>

        <div className="flex flex-row sm:flex-col gap-2 min-w-[120px] self-end sm:self-center">
          {producto.estadoRelacionado !== 'RELACIONADO' && (
            <button
              onClick={() => onRelacionar(producto)}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center transition"
            >
              <Link2 size={14} className="mr-1" />
              Relacionar
            </button>
          )}
          {producto.estadoRelacionado === 'RELACIONADO' && (
            <>
              <button
                onClick={() => onCambiarRelacion(producto)}
                className="w-full px-3 py-1.5 border border-orange-200 text-orange-600 hover:bg-orange-50 font-semibold rounded-xl text-xs flex items-center justify-center transition"
                title="Cambiar relación"
              >
                <Link2 size={12} className="mr-1" />
                Cambiar
              </button>
              <button
                onClick={() => onEditarFactor(producto)}
                className="w-full px-3 py-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 font-semibold rounded-xl text-xs flex items-center justify-center transition"
                title="Editar factor de conversión"
              >
                <Settings size={12} className="mr-1" />
                Factor
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
