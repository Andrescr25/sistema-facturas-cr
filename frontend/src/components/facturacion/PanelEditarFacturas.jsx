import { useState } from 'react'
import { Search, X, AlertCircle, Edit, RefreshCw, RotateCw, Loader2, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

/**
 * Contenido de la pestaña "Editar Facturas": búsqueda de facturas
 * (local + online), listado, y las ediciones/facturas pendientes de
 * sincronizar. Extraído de Facturacion.jsx.
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
  onDescartarEdicionPendiente,
  facturasPendientesDetalle,
  onDescartarFacturaPendiente,
  onReintentarFacturaPendiente,
  reintentandoLocalId
}) {
  const [productosVisibles, setProductosVisibles] = useState({})

  const toggleProductos = (localId) => {
    setProductosVisibles(prev => ({ ...prev, [localId]: !prev[localId] }))
  }

  return (
    <div className={`${isMobile ? 'px-4 mb-4' : 'mb-6'}`}>
      <div className="card p-4 sm:p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Search size={20} />
          Editar Facturas
        </h3>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutro-400" size={20} />
            <input
              /* type="text": Chrome le pone su propia X a los campos
                 "search" y quedaban dos equis juntas. */
              type="text"
              inputMode="search"
              value={busquedaFactura}
              onChange={(e) => onBusquedaFacturaChange(e.target.value)}
              placeholder="Buscar por número de factura o cliente..."
              className="input w-full pl-10"
            />
            {busquedaFactura && (
              <button
                onClick={onLimpiarBusquedaFactura}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutro-400 hover:text-neutro-600"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {buscandoFacturas && (
          <div className="text-center py-8">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-neutro-600">Cargando facturas...</p>
          </div>
        )}

        {!buscandoFacturas && facturasEncontradas.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-neutro-600 mb-2">
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
                  className="w-full text-left p-3 sm:p-4 border border-neutro-200 rounded-lg hover:bg-primario-50 hover:border-primario-300 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutro-900 truncate">
                        Factura #{factura.numberTemplate?.fullNumber || factura.id}
                      </p>
                      <p className="text-sm text-neutro-600 truncate">
                        Cliente: {factura.client?.name || factura.cliente_nombre || 'N/A'}
                      </p>
                      <p className="text-sm text-neutro-500">
                        Fecha: {factura.date
                          ? new Date(factura.date).toLocaleDateString('es-CR')
                          : factura.fecha_emision
                            ? new Date(factura.fecha_emision).toLocaleDateString('es-CR')
                            : 'N/A'}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {factura.pendienteSincronizar && (
                          <span className="text-xs px-2 py-0.5 bg-alerta-100 text-alerta-800 rounded-full">
                            Pendiente de envío
                          </span>
                        )}
                        {factura.pendienteEdicion && (
                          <span className="text-xs px-2 py-0.5 bg-alerta-100 text-alerta-800 rounded-full">
                            Edición pendiente
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-exito-600 whitespace-nowrap">
                        ₡{(factura.total || 0).toLocaleString('es-CR')}
                      </p>
                      <span className="text-xs text-primario-600 flex items-center gap-1 justify-end">
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
          <div className="text-center py-8 text-neutro-500">
            <AlertCircle size={48} className="mx-auto mb-2 opacity-50" />
            <p>
              {busquedaFactura
                ? 'No se encontraron facturas con ese criterio'
                : 'No hay facturas en cache'
              }
            </p>
            {!isOnline && (
              <p className="text-sm text-alerta-600 mt-2">
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

        {facturasPendientesDetalle.length > 0 && (
          <div className="mt-6 p-3 sm:p-4 bg-alerta-50 border border-alerta-200 rounded-lg">
            <h4 className="font-semibold text-alerta-900 mb-2 flex items-center gap-2">
              <AlertCircle size={18} />
              Facturas Pendientes de Envío
            </h4>
            <p className="text-sm text-alerta-800 mb-3">
              Hay {facturasPendientesDetalle.length} factura(s) que se enviarán a Alegra cuando haya conexión.
            </p>
            <div className="space-y-3">
              {facturasPendientesDetalle.map((factura) => {
                const procesando = reintentandoLocalId === factura.localId
                const mostrarProductos = Boolean(productosVisibles[factura.localId])

                return (
                  <div
                    key={factura.localId}
                    className={`relative bg-white p-3 rounded-lg border border-alerta-200 shadow-sm transition-opacity ${procesando ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    {procesando && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-lg z-10">
                        <Loader2 size={22} className="animate-spin text-primario-500" />
                      </div>
                    )}

                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-neutro-900">{factura.clienteNombre}</p>
                      <p className="text-sm font-bold text-exito-600 whitespace-nowrap">
                        ₡{factura.total.toLocaleString('es-CR')}
                      </p>
                    </div>

                    <p className="text-xs text-neutro-500 mt-0.5">
                      Creada: {new Date(factura.timestamp).toLocaleString('es-CR')}
                    </p>

                    {factura.intentosSincronizacion > 0 && (
                      <p className="text-xs text-neutro-500">
                        Intentos de envío: {factura.intentosSincronizacion}
                      </p>
                    )}

                    {factura.errorSincronizacion && (
                      <p className="text-xs text-peligro-600 mt-1 bg-peligro-50 border border-peligro-100 rounded px-2 py-1">
                        Error: {factura.errorSincronizacion}
                      </p>
                    )}

                    {factura.items.length > 0 && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => toggleProductos(factura.localId)}
                          className="text-xs text-neutro-600 hover:text-neutro-900 flex items-center gap-1"
                        >
                          {mostrarProductos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          {factura.cantidadItems} producto(s)
                        </button>

                        {mostrarProductos && (
                          <ul className="mt-2 space-y-1 border-t border-neutro-100 pt-2">
                            {factura.items.map((item, idx) => (
                              <li key={idx} className="flex items-center justify-between gap-2 text-xs text-neutro-700">
                                <span className="truncate">{item.cantidad} × {item.nombre}</span>
                                <span className="shrink-0 text-neutro-500">₡{item.precio.toLocaleString('es-CR')}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={() => onReintentarFacturaPendiente(factura.localId)}
                        disabled={procesando || !isOnline}
                        title={!isOnline ? 'Necesitas conexión para reintentar' : undefined}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md bg-primario-600 text-white hover:bg-primario-700 disabled:opacity-50 transition-colors"
                      >
                        <RotateCw size={14} />
                        Reintentar
                      </button>
                      <button
                        onClick={() => onDescartarFacturaPendiente(factura.localId)}
                        disabled={procesando}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-peligro-200 text-peligro-600 hover:bg-peligro-50 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 size={14} />
                        Descartar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {edicionesPendientes.length > 0 && (
          <div className="mt-6 p-3 sm:p-4 bg-alerta-50 border border-alerta-200 rounded-lg">
            <h4 className="font-semibold text-alerta-900 mb-2 flex items-center gap-2">
              <AlertCircle size={18} />
              Ediciones Pendientes de Sincronización
            </h4>
            <p className="text-sm text-alerta-800 mb-3">
              Hay {edicionesPendientes.length} edición(es) que se sincronizarán cuando haya conexión.
            </p>
            <div className="space-y-2">
              {edicionesPendientes.map((edicion) => (
                <div key={edicion.localId} className="bg-white p-3 rounded-lg border border-alerta-200 shadow-sm">
                  <p className="text-sm font-medium">Factura ID: {edicion.facturaId}</p>
                  <p className="text-xs text-neutro-600">
                    Editada: {new Date(edicion.timestamp).toLocaleString('es-CR')}
                  </p>
                  {edicion.errorSincronizacion && (
                    <p className="text-xs text-peligro-600 mt-1 bg-peligro-50 border border-peligro-100 rounded px-2 py-1">
                      Error: {edicion.errorSincronizacion}
                    </p>
                  )}
                  <div className="mt-2">
                    <button
                      onClick={() => onDescartarEdicionPendiente(edicion.localId, edicion.facturaId)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-peligro-200 text-peligro-600 hover:bg-peligro-50 transition-colors"
                    >
                      <Trash2 size={14} />
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
