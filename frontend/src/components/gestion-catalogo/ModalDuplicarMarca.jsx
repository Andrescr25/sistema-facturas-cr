import { X, RefreshCw, Loader2, ImageIcon, Check, Plus } from 'lucide-react'
import { useModal } from '../../hooks/useModal'

/**
 * Modal para duplicar un producto por marca: formulario de datos de la
 * nueva marca + selector de imagen sugerida. Extraído de
 * GestionCatalogo.jsx.
 */
export default function ModalDuplicarMarca({
  producto,
  newProductName,
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
  onNewProductNameChange,
  onBuscarSugerencias,
  onSubmit,
  onCerrar
}) {
  useModal(onCerrar)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutro-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col border border-neutro-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-5 border-b border-neutro-100 bg-neutro-50">
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider bg-primario-50 text-primario-600 border border-primario-100 px-2 py-0.5 rounded-full">
              Duplicar para Marcas
            </span>
            <h3 className="text-base font-bold text-neutro-900 mt-1 line-clamp-1">
              Duplicar producto: {producto.name}
            </h3>
          </div>
          <button
            onClick={onCerrar}
            className="p-2 text-neutro-400 hover:text-neutro-600 rounded-lg hover:bg-neutro-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form & Image Picker Container */}
        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-neutro-100">

          {/* Left Column: Form Details */}
          <div className="w-full md:w-1/2 p-6 space-y-4">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-neutro-400">Detalles de la nueva marca</h4>

            <div className="space-y-1">
              <label className="text-xs font-bold text-neutro-700">Nombre del Producto (edítalo para agregar la marca):</label>
              <input
                type="text"
                value={newProductName}
                onChange={onNewProductNameChange}
                placeholder="Nombre del producto duplicado..."
                required
                className="w-full px-3 py-2 bg-neutro-50 border border-neutro-200 rounded-lg text-sm text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-neutro-700">Nueva Referencia (Código):</label>
              <input
                type="text"
                value={brandRef}
                onChange={(e) => setBrandRef(e.target.value)}
                required
                placeholder="Código del producto..."
                className="w-full px-3 py-2 bg-neutro-50 border border-neutro-200 rounded-lg text-sm text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutro-700">Precio de Venta (₡):</label>
                <input
                  type="number"
                  step="0.01"
                  value={brandPrice}
                  onChange={(e) => setBrandPrice(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-neutro-50 border border-neutro-200 rounded-lg text-sm text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutro-700">Costo Unitario (₡):</label>
                <input
                  type="number"
                  step="0.01"
                  value={brandCost}
                  onChange={(e) => setBrandCost(e.target.value)}
                  className="w-full px-3 py-2 bg-neutro-50 border border-neutro-200 rounded-lg text-sm text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white"
                />
              </div>
            </div>

            {brandImageUrl && (
              <div className="p-3 bg-primario-50 border border-primario-100 rounded-lg flex items-center gap-3">
                <img src={brandImageUrl} alt="Selected" className="h-12 w-12 object-contain bg-white rounded border border-primario-200" />
                <div>
                  <div className="text-[10px] uppercase font-bold text-primario-600">Imagen Seleccionada</div>
                  <button
                    type="button"
                    onClick={() => setBrandImageUrl('')}
                    className="text-xs text-peligro-500 hover:text-peligro-700 font-medium underline mt-0.5"
                  >
                    Quitar imagen
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Dynamic Image Suggestions Grid */}
          <div className="w-full md:w-1/2 p-6 bg-neutro-50 flex flex-col justify-between">
            <div className="space-y-4 flex-1">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-extrabold uppercase tracking-wide text-neutro-400">Sugerir Imagen para la marca</h4>
                <button
                  type="button"
                  onClick={onBuscarSugerencias}
                  disabled={loadingBrandSuggestions || !newProductName.trim()}
                  className="px-3 py-1 bg-white border border-neutro-200 text-primario-600 hover:bg-primario-50 active:scale-95 text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1 disabled:opacity-50"
                >
                  {loadingBrandSuggestions ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Buscar Fotos
                </button>
              </div>

              {loadingBrandSuggestions ? (
                <div className="h-44 flex flex-col justify-center items-center gap-1">
                  <Loader2 className="h-6 w-6 text-primario-600 animate-spin" />
                  <span className="text-xs text-neutro-400">Buscando imágenes sugeridas...</span>
                </div>
              ) : brandSuggestions.length === 0 ? (
                <div className="h-44 flex flex-col justify-center items-center text-center p-4 border border-dashed border-neutro-200 rounded-xl bg-white">
                  <ImageIcon className="h-8 w-8 text-neutro-300 mb-1" />
                  <span className="text-xs font-medium text-neutro-500">Sin sugerencias cargadas</span>
                  <span className="text-[10px] text-neutro-400 mt-0.5">
                    Escribe el nombre del producto y haz clic en "Buscar Fotos"
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
                        brandImageUrl === img.url ? 'border-primario-600 ring-2 ring-primario-300 scale-95' : 'border-neutro-200 hover:border-primario-400'
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
                        <div className="absolute top-1 right-1 bg-primario-600 text-white rounded-full p-0.5">
                          <Check className="h-2.5 w-2.5" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-neutro-100 flex justify-end gap-3 bg-neutro-50 mt-4">
              <button
                type="button"
                onClick={onCerrar}
                className="px-4 py-2 border border-neutro-200 rounded-lg text-sm text-neutro-600 font-semibold hover:bg-neutro-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingDuplicate}
                className="px-5 py-2 bg-primario-600 text-white font-bold rounded-lg text-sm hover:bg-primario-700 transition-colors flex items-center gap-2 shadow-md disabled:opacity-50"
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
