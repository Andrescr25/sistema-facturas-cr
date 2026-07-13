import { X, Search, Loader2, AlertCircle, Check } from 'lucide-react'

/**
 * Modal de sugerencias automáticas de imagen para un producto, con barra de
 * búsqueda editable. Extraído de GestionCatalogo.jsx.
 */
export default function ModalSugerirImagen({
  producto,
  customSearchQuery,
  setCustomSearchQuery,
  imageSuggestions,
  loadingSuggestions,
  assigningImage,
  onBuscar,
  onAsignar,
  onCerrar
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50">
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">
              Sugerencias Automáticas
            </span>
            <h3 className="text-base font-bold text-gray-900 mt-1 line-clamp-1">
              Sugerir imagen para: {producto.name}
            </h3>
          </div>
          <button
            onClick={onCerrar}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Custom search bar */}
        <div className="p-4 border-b border-gray-100 flex gap-2">
          <input
            type="text"
            value={customSearchQuery}
            onChange={(e) => setCustomSearchQuery(e.target.value)}
            placeholder="Editar término de búsqueda..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => onBuscar(customSearchQuery)}
            disabled={loadingSuggestions}
            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg text-sm hover:bg-blue-700 transition-colors flex items-center gap-1.5"
          >
            {loadingSuggestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </button>
        </div>

        {/* Modal Body / Images Grid */}
        <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
          {loadingSuggestions ? (
            <div className="h-48 flex flex-col justify-center items-center gap-2">
              <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              <span className="text-sm text-gray-500 font-medium">Buscando imágenes sugeridas...</span>
            </div>
          ) : imageSuggestions.length === 0 ? (
            <div className="h-48 flex flex-col justify-center items-center text-center p-4">
              <AlertCircle className="h-10 w-10 text-gray-400 mb-2" />
              <span className="text-sm font-semibold text-gray-600">No encontramos sugerencias</span>
              <span className="text-xs text-gray-400 mt-1 max-w-sm">
                Prueba modificando la barra de búsqueda superior con un nombre de producto más simple.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {imageSuggestions.map((img, i) => (
                <button
                  key={i}
                  onClick={() => onAsignar(img.url)}
                  disabled={assigningImage}
                  className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden p-2 hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 hover:shadow-md transition-all flex flex-col items-center justify-center aspect-square"
                >
                  <img
                    src={img.thumbnail}
                    alt="Suggestion"
                    className="object-contain h-full w-full max-h-[120px] p-1"
                    loading="lazy"
                    onError={(e) => {
                      if (e.target.src !== img.url) {
                        e.target.src = img.url
                      } else {
                        e.target.src = 'https://placehold.co/150?text=Error+Carga'
                      }
                    }}
                  />

                  {/* Hover status select */}
                  <div className="absolute inset-0 bg-blue-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                    {assigningImage ? (
                      <Loader2 className="h-7 w-7 text-white animate-spin" />
                    ) : (
                      <Check className="h-7 w-7 text-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onCerrar}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 font-semibold hover:bg-gray-100 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
