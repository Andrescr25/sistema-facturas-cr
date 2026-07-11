import { Package, Edit, Settings, Trash2 } from 'lucide-react'

/**
 * Listado paginado de productos relacionados con sus acciones (ver
 * relaciones, editar, factor de conversión, eliminar). Extraído de
 * GestionarRelaciones.jsx.
 */
export default function ListaProductosRelacionados({
  productos,
  loading,
  page,
  totalPages,
  setPage,
  onVerRelaciones,
  onEditar,
  onFactor,
  onEliminar
}) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="spinner mx-auto mb-4"></div>
        <p className="text-gray-600">Cargando productos...</p>
      </div>
    )
  }

  if (productos.length === 0) {
    return (
      <div className="card text-center py-12">
        <Package className="mx-auto text-gray-400 mb-4" size={48} />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No se encontraron productos
        </h3>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {productos.map((producto) => (
          <div key={producto.id} className="card hover:shadow-lg transition-shadow">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Info del producto proveedor */}
              <div className="lg:col-span-5">
                <h4 className="font-semibold text-gray-900 mb-2">{producto.descripcion}</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Código: <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{producto.codigo}</span></p>
                  <p>Proveedor: <span className="font-medium text-gray-800">{producto.proveedor?.nombre}</span></p>
                  <p className="text-xs text-gray-400">
                    ID Mapeo: <span className="font-mono">{producto.id}</span>
                  </p>
                </div>
              </div>

              {/* Info producto Alegra */}
              <div className="lg:col-span-5">
                {producto.mapeo ? (
                  <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100">
                    <p className="text-xxs font-bold uppercase tracking-wider text-emerald-600 mb-1.5">Relacionado con Alegra</p>
                    <h5 className="font-semibold text-emerald-950 mb-1 text-sm">{producto.mapeo.alegraName}</h5>
                    <div className="text-xs text-emerald-800 space-y-1 font-mono">
                      <p>Ref: {producto.mapeo.alegraReference || 'N/A'}</p>
                      {producto.factorConversion && producto.factorConversion !== 1 && (
                        <p className="text-blue-600 font-bold mt-1 text-xs">
                          🔄 Factor: {producto.factorConversion}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                    <p className="text-gray-600 text-sm font-medium">Sin relación</p>
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div className="lg:col-span-2 flex flex-col gap-1.5 justify-center">
                {producto.estadoRelacionado === 'RELACIONADO' && (
                  <>
                    <button
                      onClick={() => onVerRelaciones(producto)}
                      className="w-full px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold rounded-xl text-xs flex items-center justify-center transition"
                      title="Ver todas las relaciones de este producto con diferentes proveedores"
                    >
                      <Package size={14} className="mr-1" />
                      Ver Relaciones
                    </button>
                    <button
                      onClick={() => onEditar(producto)}
                      className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center transition"
                    >
                      <Edit size={14} className="mr-1" />
                      Editar
                    </button>
                    <button
                      onClick={() => onFactor(producto)}
                      className="w-full px-3 py-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 font-semibold rounded-xl text-xs flex items-center justify-center transition"
                    >
                      <Settings size={14} className="mr-1" />
                      Factor
                      {producto.mapeo?.factorConversion && producto.mapeo.factorConversion !== 1 && (
                        <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full">✓</span>
                      )}
                    </button>
                    <button
                      onClick={() => onEliminar(producto)}
                      className="w-full px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 font-semibold rounded-xl text-xs flex items-center justify-center transition"
                    >
                      <Trash2 size={14} className="mr-1" />
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="btn btn-outline text-sm"
          >
            Primera
          </button>
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="btn btn-outline text-sm"
          >
            Anterior
          </button>
          <span className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
            className="btn btn-outline text-sm"
          >
            Siguiente
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className="btn btn-outline text-sm"
          >
            Última
          </button>
        </div>
      )}
    </>
  )
}
