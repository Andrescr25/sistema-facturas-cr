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
        <p className="text-neutro-600">Cargando productos...</p>
      </div>
    )
  }

  if (productos.length === 0) {
    return (
      <div className="card text-center py-12">
        <Package className="mx-auto text-neutro-400 mb-4" size={48} />
        <h3 className="text-lg font-semibold text-neutro-900 mb-2">
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
                <h4 className="font-semibold text-neutro-900 mb-2">{producto.descripcion}</h4>
                <div className="text-sm text-neutro-600 space-y-1">
                  <p>Código: <span className="font-mono bg-neutro-100 px-2 py-0.5 rounded text-xs">{producto.codigo}</span></p>
                  <p>Proveedor: <span className="font-medium text-neutro-800">{producto.proveedor?.nombre}</span></p>
                  <p className="text-xs text-neutro-400">
                    ID Mapeo: <span className="font-mono">{producto.id}</span>
                  </p>
                </div>
              </div>

              {/* El producto propio */}
              <div className="lg:col-span-5">
                {producto.mapeo ? (
                  <div className="bg-exito-50/50 rounded-2xl p-4 border border-exito-100">
                    <p className="text-xxs font-bold uppercase tracking-wider text-exito-600 mb-1.5">Relacionado con</p>
                    <h5 className="font-semibold text-exito-950 mb-1 text-sm">{producto.mapeo.productoNombre}</h5>
                    <div className="text-xs text-exito-800 space-y-1 font-mono">
                      <p>Ref: {producto.mapeo.productoReferencia || 'N/A'}</p>
                      {producto.factorConversion && producto.factorConversion !== 1 && (
                        <p className="text-primario-600 font-bold mt-1 text-xs">
                          🔄 Factor: {producto.factorConversion}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-neutro-50 rounded-2xl p-4 border border-neutro-200">
                    <p className="text-neutro-600 text-sm font-medium">Sin relación</p>
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div className="lg:col-span-2 flex flex-col gap-1.5 justify-center">
                {producto.estadoRelacionado === 'RELACIONADO' && (
                  <>
                    <button
                      onClick={() => onVerRelaciones(producto)}
                      className="w-full px-3 py-1.5 bg-nota-50 hover:bg-nota-100 text-nota-700 font-semibold rounded-xl text-xs flex items-center justify-center transition"
                      title="Ver todas las relaciones de este producto con diferentes proveedores"
                    >
                      <Package size={14} className="mr-1" />
                      Ver Relaciones
                    </button>
                    <button
                      onClick={() => onEditar(producto)}
                      className="w-full px-3 py-1.5 bg-primario-600 hover:bg-primario-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center transition"
                    >
                      <Edit size={14} className="mr-1" />
                      Editar
                    </button>
                    <button
                      onClick={() => onFactor(producto)}
                      className="w-full px-3 py-1.5 border border-primario-200 text-primario-600 hover:bg-primario-50 font-semibold rounded-xl text-xs flex items-center justify-center transition"
                    >
                      <Settings size={14} className="mr-1" />
                      Factor
                      {producto.mapeo?.factorConversion && producto.mapeo.factorConversion !== 1 && (
                        <span className="ml-1 text-[10px] bg-primario-100 text-primario-700 px-1 py-0.5 rounded-full">✓</span>
                      )}
                    </button>
                    <button
                      onClick={() => onEliminar(producto)}
                      className="w-full px-3 py-1.5 border border-peligro-200 text-peligro-600 hover:bg-peligro-50 font-semibold rounded-xl text-xs flex items-center justify-center transition"
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
          <span className="px-4 py-2 bg-primario-100 text-primario-700 rounded-lg font-medium">
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
