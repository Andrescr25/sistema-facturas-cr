import { Package, XCircle } from 'lucide-react'

/**
 * Modal que muestra todas las relaciones de un producto de Alegra con los
 * distintos proveedores que lo suministran. Extraído de
 * GestionarRelaciones.jsx.
 */
export default function ModalVerRelaciones({ producto, relaciones, cargando, onCerrar }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-auto">
        <div className="p-6 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">📦 Relaciones del Producto</h3>
              <p className="text-sm text-gray-600 mt-1">
                Todas las relaciones de este producto con diferentes proveedores
              </p>
            </div>
            <button
              onClick={onCerrar}
              className="text-gray-500 hover:text-gray-700"
            >
              <XCircle size={24} />
            </button>
          </div>

          {/* Info del producto de Alegra */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-2">Producto en Alegra:</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-blue-600 font-medium">Nombre:</span>
                <p className="text-blue-900">{producto.mapeo?.alegraName || producto.alegraName || 'N/A'}</p>
              </div>
              <div>
                <span className="text-blue-600 font-medium">Referencia:</span>
                <p className="text-blue-900 font-mono">{producto.mapeo?.alegraReference || producto.alegraReference || 'N/A'}</p>
              </div>
              <div>
                <span className="text-blue-600 font-medium">ID Alegra:</span>
                <p className="text-blue-900 font-mono text-xs">{producto.alegraItemId}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {cargando ? (
            <div className="text-center py-12">
              <div className="spinner mx-auto mb-4"></div>
              <p className="text-gray-600">Cargando relaciones...</p>
            </div>
          ) : relaciones && relaciones.relaciones ? (
            relaciones.relaciones.length === 0 ? (
              <div className="text-center py-12">
                <Package className="mx-auto text-gray-400 mb-4" size={48} />
                <h4 className="text-lg font-semibold text-gray-900 mb-2">
                  No hay relaciones con proveedores
                </h4>
                <p className="text-gray-600">
                  Este producto aún no tiene relaciones con proveedores.
                </p>
              </div>
            ) : (
              <div>
                {/* Título de sección */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">
                    Este producto está relacionado con:
                  </h3>
                </div>

                {/* Lista simple de proveedores */}
                <div className="space-y-3">
                  {relaciones.relaciones.map((relacion) => (
                    <div
                      key={relacion.mapeoId}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-semibold text-gray-900">
                              {relacion.proveedor.nombre}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>
                              <span className="font-medium">Código:</span>{' '}
                              <span className="font-mono text-gray-900">{relacion.codigoProveedor || 'N/A'}</span>
                            </span>
                            {relacion.factorConversion > 1 && (
                              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                factor {relacion.factorConversion}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-600">
                            {relacion.precio ? (
                              <>₡{relacion.precio.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</>
                            ) : (
                              <span className="text-gray-400 text-sm">Sin precio</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">Costo por unidad mía</div>
                          {/* Solo cuando el proveedor factura en otra presentación:
                              si el factor es 1 ambas cifras son la misma y repetirla confunde. */}
                          {relacion.factorConversion > 1 && relacion.precioProveedor && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              ₡{relacion.precioProveedor.toLocaleString('es-CR', { minimumFractionDigits: 2 })} por{' '}
                              {relacion.factorConversion} unid.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="text-center py-12 text-gray-500">
              No se pudieron cargar las relaciones
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <button
            onClick={onCerrar}
            className="btn btn-primary w-full"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
