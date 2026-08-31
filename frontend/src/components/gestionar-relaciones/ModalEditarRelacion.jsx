import { Search, XCircle } from 'lucide-react'

/**
 * Modal para reasignar la relación de un producto de proveedor a otro
 * producto de Alegra, con búsqueda incremental. Extraído de
 * GestionarRelaciones.jsx.
 */
export default function ModalEditarRelacion({
  producto,
  terminoBusqueda,
  setTerminoBusqueda,
  resultadosBusqueda,
  buscando,
  onCambiarRelacion,
  onCerrar
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto">
        <div className="p-6 border-b sticky top-0 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-neutro-900">Editar Relación</h3>
            <button
              onClick={onCerrar}
              className="text-neutro-500 hover:text-neutro-700"
            >
              <XCircle size={24} />
            </button>
          </div>

          <div className="bg-neutro-50 rounded-lg p-4 mb-4">
            <h4 className="font-semibold text-neutro-900 mb-2">Producto Actual:</h4>
            <p className="text-sm text-neutro-700 mb-1">{producto.descripcion}</p>
            <p className="text-sm text-neutro-600">Código: {producto.codigoProveedor}</p>
            {producto.mapeo && (
              <p className="text-sm text-exito-700 mt-2">
                Actualmente relacionado con: <strong>{producto.mapeo.alegraName}</strong>
              </p>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutro-400" size={20} />
            <input
              type="text"
              placeholder="Buscar nuevo producto en Alegra..."
              value={terminoBusqueda}
              onChange={(e) => setTerminoBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-neutro-300 rounded-lg focus:ring-2 focus:ring-primario-500 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        <div className="p-6">
          {buscando ? (
            <div className="text-center py-8">
              <div className="spinner mx-auto mb-4"></div>
              <p className="text-neutro-600">Buscando...</p>
            </div>
          ) : resultadosBusqueda.length === 0 ? (
            <div className="text-center py-8 text-neutro-500">
              {terminoBusqueda.length < 2
                ? 'Escribe al menos 2 caracteres para buscar'
                : 'No se encontraron productos'}
            </div>
          ) : (
            <div className="space-y-2">
              {resultadosBusqueda.map((resultado) => (
                <div
                  key={resultado.id}
                  className="border rounded-lg p-4 hover:bg-neutro-50 cursor-pointer transition-colors flex items-center justify-between"
                  onClick={() => onCambiarRelacion(resultado.id, resultado.name)}
                >
                  <div>
                    <h4 className="font-semibold text-neutro-900">{resultado.name}</h4>
                    <div className="flex gap-4 text-sm text-neutro-600 mt-1">
                      <span>Ref: {resultado.reference || 'N/A'}</span>
                      <span>₡{resultado.price?.toLocaleString('es-CR')}</span>
                    </div>
                  </div>
                  <button className="btn btn-primary text-sm">
                    Cambiar a este
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
