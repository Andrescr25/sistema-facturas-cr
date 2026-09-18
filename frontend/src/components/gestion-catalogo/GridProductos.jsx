import { ImageIcon, Plus, Edit, AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { formatCRC } from '../../utils/gestionCatalogoUtils'

/**
 * Grilla de productos del catálogo (con acciones al hover) y paginación.
 * Extraído de GestionCatalogo.jsx.
 */
export default function GridProductos({
  productos,
  loading,
  currentPage,
  totalPages,
  setCurrentPage,
  onSugerirFoto,
  onAgregarMarca,
  onEditar
}) {
  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col justify-center items-center gap-3 bg-white rounded-xl shadow-md border border-neutro-100">
        <Loader2 className="h-10 w-10 text-primario-600 animate-spin" />
        <span className="text-neutro-500 font-medium">Cargando catálogo...</span>
      </div>
    )
  }

  if (productos.length === 0) {
    return (
      <div className="min-h-[300px] flex flex-col justify-center items-center bg-white rounded-xl shadow-md border border-neutro-100 p-8 text-center">
        <AlertCircle className="h-12 w-12 text-neutro-400 mb-3" />
        <h3 className="text-lg font-bold text-neutro-800">No se encontraron productos</h3>
        <p className="text-neutro-500 mt-1 max-w-md">
          No encontramos ningún producto activo que coincida con tus criterios de búsqueda. Intenta limpiando los filtros o sincronizando con Alegra.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {productos.map((prod) => {
          const hasImg = !!prod.imageUrl
          return (
            <div
              key={prod.id}
              className="group relative bg-white border border-neutro-200 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col"
            >
              {/* Product Image Panel */}
              <div className={`relative h-36 bg-neutro-50 flex items-center justify-center overflow-hidden border-b border-neutro-100 ${!hasImg ? 'border-dashed border-peligro-200' : ''}`}>
                {hasImg ? (
                  <img
                    src={prod.imageUrl}
                    alt={prod.name}
                    className="object-contain h-full w-full group-hover:scale-105 transition-transform duration-300 p-2"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-4">
                    <ImageIcon className="h-8 w-8 text-peligro-300 animate-pulse mb-1" />
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-peligro-500 bg-peligro-50 px-2 py-0.5 rounded-full border border-peligro-100">
                      Sin Imagen
                    </span>
                  </div>
                )}

                {/* Reference Badge */}
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-neutro-900/80 backdrop-blur-sm text-white text-[10px] font-bold rounded-md uppercase tracking-wider max-w-[80%] truncate">
                  {prod.reference || 'Sin Ref'}
                </span>
              </div>

              {/* Info Panel */}
              <div className="p-3 flex-1 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-primario-600 truncate">
                    {prod.category || 'General'}
                    {/* La subcategoría solo aparece si la tiene: la mayoría
                        todavía no está clasificada y repetir "sin clasificar"
                        en cada tarjeta solo agrega ruido. */}
                    {prod.subcategoria && (
                      <span className="ml-1 font-semibold text-primario-700">· {prod.subcategoria.nombre}</span>
                    )}
                  </div>
                  <h3 className="text-xs font-bold text-neutro-800 line-clamp-2 h-8 leading-tight group-hover:text-primario-600 transition-colors" title={prod.name}>
                    {prod.name}
                  </h3>
                </div>

                {/* Los tres números dicen en qué base están. En Alegra el
                    precio va SIN impuesto y el costo CON él: mostrarlos lado
                    a lado sin decirlo hacía leer un margen de 15% donde el
                    real es 25%. */}
                <div className="mt-3 pt-2.5 border-t border-neutro-50 flex flex-col gap-0.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-neutro-400 font-medium">Precio s/IVA:</span>
                    <span className="font-medium text-neutro-600">{formatCRC(prod.price)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-neutro-400 font-medium">Precio c/IVA:</span>
                    {/* null = todavía no se sincronizó el impuesto; repetir el
                        precio sin IVA sería decir que no lleva. */}
                    <span className="font-bold text-neutro-900">
                      {prod.precioConIva != null ? formatCRC(prod.precioConIva) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-neutro-400 font-medium">Costo c/IVA:</span>
                    <span className="font-medium text-neutro-500">{formatCRC(prod.cost)}</span>
                  </div>
                </div>
              </div>

              {/* Hover overlay with action buttons */}
              <div className="absolute inset-0 bg-neutro-900/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 flex flex-col justify-center items-stretch gap-2 p-4 transition-all duration-300 z-10">
                <button
                  onClick={() => onSugerirFoto(prod)}
                  className="flex items-center justify-center gap-1.5 py-1.5 bg-primario-600 hover:bg-primario-700 active:scale-95 text-white text-[11px] font-bold rounded-lg transition-all"
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Sugerir Foto
                </button>
                <button
                  onClick={() => onAgregarMarca(prod)}
                  className="flex items-center justify-center gap-1.5 py-1.5 bg-primario-600 hover:bg-primario-700 active:scale-95 text-white text-[11px] font-bold rounded-lg transition-all"
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar Marcas
                </button>
                <button
                  onClick={() => onEditar(prod)}
                  className="flex items-center justify-center gap-1.5 py-1.5 bg-white hover:bg-neutro-100 active:scale-95 text-neutro-800 text-[11px] font-bold rounded-lg transition-all"
                >
                  <Edit className="h-3.5 w-3.5 text-neutro-500" /> Editar
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination component */}
      {totalPages > 1 && (
        <div className="bg-white rounded-xl shadow-md p-4 border border-neutro-100 flex justify-between items-center">
          <span className="text-xs text-neutro-500 font-medium">
            Página <span className="font-bold text-neutro-700">{currentPage}</span> de <span className="font-bold text-neutro-700">{totalPages}</span>
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-2 border border-neutro-200 rounded-lg text-neutro-500 hover:bg-neutro-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-2 border border-neutro-200 rounded-lg text-neutro-500 hover:bg-neutro-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
