import { Search, X, AlertCircle, Edit, RefreshCw } from 'lucide-react'

/**
 * Contenido de la pestaña "Editar Facturas": búsqueda de facturas
 * (local + online), listado, y las ediciones pendientes de sincronizar.
 * Extraído de Facturacion.jsx.
 */
export default function PanelEditarFacturas({
  isMobile,
  isOnline,
  busquedaFactura,
  onBusquedaFacturaChange,
  onLimpiarBusquedaFactura,
  buscandoFacturas,
  facturasEncontradas,
  onCargarFacturaParaEdicion,
  onActualizarCache,
  edicionesPendientes,
  onDescartarEdicionPendiente
}) {
  return (
    <div className={`${isMobile ? 'px-4 mb-4' : 'mb-6'}`}>
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Search size={20} />
          Editar Facturas
        </h3>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="search"
              value={busquedaFactura}
              onChange={(e) => onBusquedaFacturaChange(e.target.value)}
              placeholder="Buscar por número de factura o cliente..."
              className="input w-full pl-10"
            />
            {busquedaFactura && (
              <button
                onClick={onLimpiarBusquedaFactura}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {buscandoFacturas && (
          <div className="text-center py-8">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando facturas...</p>
          </div>
        )}

        {!buscandoFacturas && facturasEncontradas.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 mb-2">
              {busquedaFactura
                ? `${facturasEncontradas.length} factura(s) encontrada(s)`
                : `${facturasEncontradas.length} facturas disponibles (últimas 60 días)`
              }
            </p>
            <div className="max-h-[600px] overflow-y-auto space-y-2">
              {facturasEncontradas.map((factura) => (
                <button
                  key={factura.id}
                  onClick={() => onCargarFacturaParaEdicion(factura)}
                  className="w-full text-left p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        Factura #{factura.numberTemplate?.fullNumber || factura.id}
                      </p>
                      <p className="text-sm text-gray-600">
                        Cliente: {factura.client?.name || factura.cliente_nombre || 'N/A'}
                      </p>
                      <p className="text-sm text-gray-500">
                        Fecha: {factura.date
                          ? new Date(factura.date).toLocaleDateString('es-CR')
                          : factura.fecha_emision
                            ? new Date(factura.fecha_emision).toLocaleDateString('es-CR')
                            : 'N/A'}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {factura.pendienteSincronizar && (
                          <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full">
                            Pendiente de envío
                          </span>
                        )}
                        {factura.pendienteEdicion && (
                          <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full">
                            Edición pendiente
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-600">
                        ₡{(factura.total || 0).toLocaleString('es-CR')}
                      </p>
                      <span className="text-xs text-blue-600 flex items-center gap-1">
                        <Edit size={12} />
                        Editar
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {!buscandoFacturas && facturasEncontradas.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <AlertCircle size={48} className="mx-auto mb-2 opacity-50" />
            <p>
              {busquedaFactura
                ? 'No se encontraron facturas con ese criterio'
                : 'No hay facturas en cache'
              }
            </p>
            {!isOnline && (
              <p className="text-sm text-orange-600 mt-2">
                Estás offline. Solo se muestran facturas en cache.
              </p>
            )}
            {isOnline && !busquedaFactura && (
              <button
                onClick={onActualizarCache}
                className="mt-4 btn btn-primary flex items-center gap-2 mx-auto"
              >
                <RefreshCw size={16} />
                Actualizar Cache
              </button>
            )}
          </div>
        )}

        {edicionesPendientes.length > 0 && (
          <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <h4 className="font-semibold text-orange-900 mb-2 flex items-center gap-2">
              <AlertCircle size={18} />
              Ediciones Pendientes de Sincronización
            </h4>
            <p className="text-sm text-orange-800 mb-3">
              Hay {edicionesPendientes.length} edición(es) que se sincronizarán cuando haya conexión.
            </p>
            <div className="space-y-2">
              {edicionesPendientes.map((edicion) => (
                <div key={edicion.localId} className="bg-white p-3 rounded border border-orange-200">
                  <p className="text-sm font-medium">Factura ID: {edicion.facturaId}</p>
                  <p className="text-xs text-gray-600">
                    Editada: {new Date(edicion.timestamp).toLocaleString('es-CR')}
                  </p>
                  {edicion.errorSincronizacion && (
                    <p className="text-xs text-red-600 mt-1">Error: {edicion.errorSincronizacion}</p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => onDescartarEdicionPendiente(edicion.localId, edicion.facturaId)}
                      className="btn btn-xs btn-outline text-red-600 border-red-200 hover:bg-red-50"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
