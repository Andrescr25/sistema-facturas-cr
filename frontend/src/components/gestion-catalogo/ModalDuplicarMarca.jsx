import { X, RefreshCw, Loader2, ImageIcon, Check, Plus } from 'lucide-react'

/**
 * Modal para duplicar un producto por marca: formulario de datos de la
 * nueva marca + selector de imagen sugerida. Extraído de
 * GestionCatalogo.jsx.
 */
export default function ModalDuplicarMarca({
  producto,
  brandName,
  brandRef,
  setBrandRef,
  brandPrice,
  setBrandPrice,
  brandCost,
  setBrandCost,
  brandImageUrl,
  setBrandImageUrl,
  brandSuggestions,
  loadingBrandSuggestions,
  creatingDuplicate,
  onBrandNameChange,
  onBuscarSugerencias,
  onSubmit,
  onCerrar
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50">
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full">
              Duplicar para Marcas
            </span>
            <h3 className="text-base font-bold text-gray-900 mt-1 line-clamp-1">
              Duplicar producto: {producto.name}
            </h3>
          </div>
          <button
            onClick={onCerrar}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form & Image Picker Container */}
        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100">

          {/* Left Column: Form Details */}
          <div className="w-full md:w-1/2 p-6 space-y-4">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-gray-400">Detalles de la nueva marca</h4>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">Nombre del Producto Base:</label>
              <input
                type="text"
                disabled
                value={producto.name}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-500 cursor-not-allowed"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">Nombre de la Marca (ej: Pepsi, Link, etc.):</label>
              <input
                type="text"
                value={brandName}
                onChange={onBrandNameChange}
                placeholder="Escribe la marca comercial..."
                required
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Nuevo Nombre Generado:</label>
                <input
                  type="text"
                  disabled
                  value={brandName.trim() ? `${producto.name} - ${brandName.trim()}` : producto.name}
                  className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-[11px] text-gray-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Nueva Referencia (Código):</label>
                <input
                  type="text"
                  value={brandRef}
                  onChange={(e) => setBrandRef(e.target.value)}
                  required
                  placeholder="Código del producto..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Precio de Venta (₡):</label>
                <input
                  type="number"
                  step="0.01"
                  value={brandPrice}
                  onChange={(e) => setBrandPrice(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Costo Unitario (₡):</label>
                <input
                  type="number"
                  step="0.01"
                  value={brandCost}
                  onChange={(e) => setBrandCost(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>
            </div>

            {brandImageUrl && (
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-3">
                <img src={brandImageUrl} alt="Selected" className="h-12 w-12 object-contain bg-white rounded border border-indigo-200" />
                <div>
                  <div className="text-[10px] uppercase font-bold text-indigo-600">Imagen Seleccionada</div>
                  <button
                    type="button"
                    onClick={() => setBrandImageUrl('')}
                    className="text-xs text-red-500 hover:text-red-700 font-medium underline mt-0.5"
                  >
                    Quitar imagen
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Dynamic Image Suggestions Grid */}
          <div className="w-full md:w-1/2 p-6 bg-gray-50 flex flex-col justify-between">
            <div className="space-y-4 flex-1">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-extrabold uppercase tracking-wide text-gray-400">Sugerir Imagen para la marca</h4>
                <button
                  type="button"
                  onClick={onBuscarSugerencias}
                  disabled={loadingBrandSuggestions || !brandName.trim()}
                  className="px-3 py-1 bg-white border border-gray-200 text-indigo-600 hover:bg-indigo-50 active:scale-95 text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1 disabled:opacity-50"
                >
                  {loadingBrandSuggestions ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Buscar Fotos
                </button>
              </div>

              {loadingBrandSuggestions ? (
                <div className="h-44 flex flex-col justify-center items-center gap-1">
                  <Loader2 className="h-6 w-6 text-indigo-600 animate-spin" />
                  <span className="text-xs text-gray-400">Buscando imágenes sugeridas...</span>
                </div>
              ) : brandSuggestions.length === 0 ? (
                <div className="h-44 flex flex-col justify-center items-center text-center p-4 border border-dashed border-gray-200 rounded-xl bg-white">
                  <ImageIcon className="h-8 w-8 text-gray-300 mb-1" />
                  <span className="text-xs font-medium text-gray-500">Sin sugerencias cargadas</span>
                  <span className="text-[10px] text-gray-400 mt-0.5">
                    Completa el nombre de la marca y haz clic en "Buscar Fotos"
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-[220px] p-1">
                  {brandSuggestions.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setBrandImageUrl(img.url)}
                      className={`relative bg-white border rounded-lg p-1.5 flex items-center justify-center aspect-square focus:outline-none transition-all ${
                        brandImageUrl === img.url ? 'border-indigo-600 ring-2 ring-indigo-300 scale-95' : 'border-gray-200 hover:border-indigo-400'
                      }`}
                    >
                      <img
                        src={img.thumbnail}
                        alt="Brand suggestion"
                        className="object-contain max-h-[50px]"
                        onError={(e) => {
                          // Si la miniatura ya proxeada falló, la URL cruda del
                          // sitio de origen casi siempre tiene el mismo bloqueo.
                          e.target.onerror = null
                          e.target.src = 'https://placehold.co/100?text=Error'
                        }}
                      />
                      {brandImageUrl === img.url && (
                        <div className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full p-0.5">
                          <Check className="h-2.5 w-2.5" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 mt-4">
              <button
                type="button"
                onClick={onCerrar}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 font-semibold hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingDuplicate}
                className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-md disabled:opacity-50"
              >
                {creatingDuplicate ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Crear Duplicado
                  </>
                )}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  )
}
