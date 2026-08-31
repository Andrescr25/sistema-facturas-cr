import { X, Search, Loader, Package, AlertCircle, Plus } from 'lucide-react'

/**
 * Modal de búsqueda de un producto de Alegra para relacionarlo con un
 * producto del proveedor, con acceso directo a crear uno nuevo si no se
 * encuentra. Extraído de RelacionarProductos.jsx.
 */
export default function ModalBuscarProducto({
  productoSeleccionado,
  busqueda,
  setBusqueda,
  resultadosBusqueda,
  buscando,
  onCerrar,
  onRelacionar,
  onCrearNuevo
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-neutro-900">
              Buscar Producto en Alegra
            </h3>
            <button
              onClick={onCerrar}
              className="text-neutro-400 hover:text-neutro-600"
            >
              <X size={24} />
            </button>
          </div>

          <div className="mb-4">
            <div className="bg-gradient-to-r from-alerta-50 to-alerta-100 rounded-lg p-4 border border-alerta-200">
              <p className="text-xs font-medium text-alerta-700 mb-2">PRODUCTO DEL PROVEEDOR</p>
              <p className="font-bold text-neutro-900 text-lg mb-2">{productoSeleccionado?.descripcion}</p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-alerta-600">Código:</span>
                  <p className="font-mono font-semibold text-neutro-900">
                    {productoSeleccionado?.codigoProveedor}
                    {productoSeleccionado?.codigoProveedor?.startsWith('DESC-') && (
                      <span className="block text-xs text-alerta-600 mt-1">⚠️ Auto-generado</span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-alerta-600">Cantidad:</span>
                  <p className="font-semibold text-neutro-900">{productoSeleccionado?.cantidad} {productoSeleccionado?.unidadMedida}</p>
                </div>
                <div>
                  <span className="text-alerta-600">Precio Proveedor:</span>
                  <p className="font-bold text-alerta-700 text-lg">₡{productoSeleccionado?.precioUnitario?.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
              {productoSeleccionado?.codigoProveedor?.startsWith('DESC-') && (
                <div className="mt-3 bg-alerta-50 border border-alerta-200 rounded-lg p-3 text-xs">
                  <p className="text-alerta-800 flex items-start">
                    <AlertCircle size={14} className="mr-2 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Nota:</strong> Este proveedor no envía códigos internos en sus facturas, por lo que el sistema generó un código basado en la descripción.
                      Cada descripción única tendrá su propio código generado.
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutro-400" size={20} />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en productos de Alegra..."
              className="w-full pl-10 pr-4 py-3 border-2 border-neutro-300 rounded-lg focus:border-primario-500 focus:ring-2 focus:ring-primario-200"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {buscando ? (
            <div className="text-center py-8">
              <Loader className="mx-auto animate-spin mb-4" size={32} />
              <p className="text-neutro-600">Buscando...</p>
            </div>
          ) : resultadosBusqueda.length === 0 ? (
            <div className="text-center py-8">
              <Package className="mx-auto text-neutro-400 mb-4" size={48} />
              <p className="text-neutro-600">
                {busqueda ? 'No se encontraron productos' : 'Escribe para buscar productos'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {resultadosBusqueda.map(prod => (
                <div
                  key={prod.id}
                  className="p-4 border-2 border-neutro-200 rounded-lg hover:border-primario-400 hover:bg-primario-50 cursor-pointer transition-all"
                  onClick={() => onRelacionar(prod)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-neutro-900 mb-2">{prod.name}</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-neutro-500">Referencia:</span>
                          <span className="ml-1 font-mono font-medium text-neutro-900">
                            {prod.reference || 'Sin ref.'}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutro-500">Precio Venta:</span>
                          <span className="ml-1 font-bold text-exito-700">
                            ₡{prod.price?.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        {prod.cost && (
                          <div>
                            <span className="text-neutro-500">Costo:</span>
                            <span className="ml-1 font-medium text-neutro-700">
                              ₡{prod.cost?.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        {prod.category && (
                          <div>
                            <span className="text-neutro-500">Categoría:</span>
                            <span className="ml-1 font-medium text-neutro-700">
                              {prod.category}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button className="btn btn-sm btn-primary ml-4 flex-shrink-0">
                      Seleccionar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-neutro-50">
          <button
            onClick={onCrearNuevo}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-primario-800 hover:bg-primario-900 text-white font-bold transition-colors"
          >
            <Plus size={20} className="mr-2" />
            Crear Nuevo Producto en Alegra
          </button>
        </div>
      </div>
    </div>
  )
}
