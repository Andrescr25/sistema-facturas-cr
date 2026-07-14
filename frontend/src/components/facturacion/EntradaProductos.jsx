import { Package, Search, Plus, X } from 'lucide-react'
import { getReference } from '../../utils/facturacionUtils'

/**
 * Tarjeta de agregar productos: toggle entrada rápida (código+cantidad,
 * solo desktop) vs búsqueda por nombre (desktop y móvil). Extraído de
 * Facturacion.jsx.
 */
export default function EntradaProductos({
  isMobile,
  cardRef,
  modoEntradaRapida,
  setModoEntradaRapida,
  codigoInputRef,
  codigoProducto,
  onCodigoChange,
  onFocusCodigo,
  onCodigoKeyPress,
  productoPreviewRapido,
  cantidadInputRef,
  cantidadProducto,
  setCantidadProducto,
  onCantidadKeyPress,
  busquedaProductoInputRef,
  busquedaProducto,
  onBusquedaProductoChange,
  onFocusBusquedaProducto,
  onLimpiarBusquedaProducto,
  productosEncontrados,
  onSeleccionarProducto
}) {
  return (
    <div ref={cardRef} className="card shadow-md p-6 rounded-2xl">
      <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900 flex items-center gap-2">
        <Package size={22} className="text-blue-600" />
        Agregar Productos
      </h3>

      {/* Toggle: Modo rápido vs Búsqueda (solo en desktop) */}
      {!isMobile && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setModoEntradaRapida(true)}
            className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors ${modoEntradaRapida
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            <Package size={16} className="inline mr-2" />
            Entrada Rápida (PC)
          </button>
          <button
            onClick={() => setModoEntradaRapida(false)}
            className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors ${!modoEntradaRapida
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            <Search size={16} className="inline mr-2" />
            Búsqueda por Nombre
          </button>
        </div>
      )}

      {/* Modo Entrada Rápida (PC) - Solo en desktop */}
      {modoEntradaRapida && !isMobile && (
        <div className="space-y-4">
          <div>
            <label className="label text-sm font-semibold text-gray-700">Código del Producto</label>
            <input
              ref={codigoInputRef}
              type="text"
              value={codigoProducto}
              onChange={(e) => onCodigoChange(e.target.value)}
              onFocus={onFocusCodigo}
              onKeyPress={onCodigoKeyPress}
              placeholder="Ingresa código y presiona Enter"
              className="input w-full text-lg py-3 px-4 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
              style={{ height: '48px' }}
              autoFocus
            />
          </div>

          {/* Vista previa del producto detectado */}
          {productoPreviewRapido && (
            <div className="bg-blue-50/50 border-2 border-blue-200 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <span className="text-xs text-blue-700 font-bold uppercase tracking-wider block mb-1">Producto Detectado</span>
                <h4 className="font-bold text-gray-900 text-base truncate">{productoPreviewRapido.name}</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Ref: <strong>{getReference(productoPreviewRapido.reference)}</strong>
                </p>
              </div>
              {productoPreviewRapido.price && (
                <div className="text-right">
                  <span className="text-xs text-gray-405 block mb-1">Precio Unitario</span>
                  <span className="text-lg font-black text-green-600 block">
                    ₡{productoPreviewRapido.price.toLocaleString('es-CR')}
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="label text-sm font-semibold text-gray-700">Cantidad</label>
            <input
              ref={cantidadInputRef}
              type="number"
              min="1"
              value={cantidadProducto}
              onChange={(e) => setCantidadProducto(e.target.value)}
              onKeyPress={onCantidadKeyPress}
              onFocus={(e) => e.target.select()}
              placeholder="Ingrese cantidad"
              className="input w-full text-lg py-3 px-4 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
              style={{ height: '48px' }}
            />
          </div>

          <p className="text-sm text-gray-500">
            💡 <strong>Flujo rápido:</strong> Ingresa código → Enter → Ingresa cantidad → Enter
          </p>
        </div>
      )}

      {/* Modo Búsqueda por Nombre - Desktop y Móvil */}
      {(!modoEntradaRapida || isMobile) && (
        <div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={22} />
            <input
              ref={busquedaProductoInputRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              value={busquedaProducto}
              onChange={(e) => onBusquedaProductoChange(e.target.value)}
              onFocus={onFocusBusquedaProducto}
              placeholder="Buscar producto por código o nombre..."
              className="input w-full pl-12 pr-12 py-4 text-lg border-2 border-gray-300 focus:border-blue-500 rounded-xl"
              style={{ fontSize: '18px', height: '56px' }}
            />
            {busquedaProducto && (
              <button
                onClick={onLimpiarBusquedaProducto}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* Resultados búsqueda productos */}
          {productosEncontrados.length > 0 && (
            <div className="mt-3 border-2 border-gray-200 rounded-xl max-h-80 overflow-y-auto divide-y divide-gray-100 shadow-md">
              {productosEncontrados.map((producto) => (
                <button
                  key={producto.id}
                  onClick={() => onSeleccionarProducto(producto)}
                  className={`w-full text-left ${isMobile ? 'p-4 py-4 border-2 border-blue-50 bg-blue-50/10' : 'p-3'} rounded-xl hover:bg-blue-50 active:bg-blue-100 transition-colors flex items-center justify-between gap-4 mb-2`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`font-bold text-gray-950 leading-tight ${isMobile ? 'text-sm whitespace-normal break-words' : 'text-sm md:text-base truncate'}`}>{producto.name}</p>
                    <p className={`text-gray-500 truncate mt-1 ${isMobile ? 'text-xs' : 'text-xs'}`}>
                      Ref: <strong>{getReference(producto.reference)}</strong>
                    </p>
                    {producto.price && (
                      <p className={`text-green-600 font-bold mt-1.5 ${isMobile ? 'text-base' : 'text-sm md:text-base'}`}>
                        ₡{producto.price.toLocaleString('es-CR')}
                      </p>
                    )}
                  </div>
                  <div className={`p-3 bg-blue-100 text-blue-700 rounded-xl flex-shrink-0 ${isMobile ? 'p-4' : ''}`}>
                    <Plus size={isMobile ? 24 : 20} strokeWidth={3} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
