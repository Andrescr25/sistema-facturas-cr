import { Search, Calendar, CheckCircle, Package, ArrowRight } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/facturasBodegaUtils'

/**
 * Listado de facturas por preparar / historial de listas, con pestañas,
 * buscador y filtro de rango de fechas. Extraído de FacturasBodega.jsx
 * (antes renderListado).
 */
export default function ListadoFacturas({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  filters,
  onFilterChange,
  onClearFilters,
  facturasMostradas,
  onSeleccionarFactura
}) {
  return (
    <div className="space-y-4">
      {/* Selector de pestañas móvil superior */}
      <div className="flex bg-neutro-100 p-1.5 rounded-2xl">
        {['pendientes', 'listas'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-center text-sm font-semibold rounded-xl transition-all duration-200 ${activeTab === tab
              ? 'bg-white text-primario-600 shadow-md ring-1 ring-black/5'
              : 'text-neutro-600 hover:text-neutro-900'
              }`}
          >
            {tab === 'pendientes' ? 'Por Preparar' : 'Historial Listas'}
          </button>
        ))}
      </div>

      {/* Buscador táctil */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutro-400" size={18} />
        <input
          type="text"
          placeholder="Buscar factura o cliente..."
          className="input pl-10 w-full rounded-2xl border-neutro-200 focus:border-primario-500 focus:ring-2 focus:ring-primario-100 text-base py-3"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-neutro-100 text-neutro-500 flex items-center justify-center text-xs hover:bg-neutro-200"
          >
            ✕
          </button>
        )}
      </div>

      {activeTab === 'pendientes' && (
        <details className="group bg-white border border-neutro-100 rounded-2xl overflow-hidden">
          <summary className="flex items-center justify-between p-3.5 text-sm font-medium text-neutro-700 cursor-pointer select-none hover:bg-neutro-50 transition">
            <span className="flex items-center gap-2">
              <Calendar size={16} className="text-neutro-500" /> Rango de Fechas
            </span>
            <span className="text-xs text-neutro-400 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="p-3.5 border-t border-neutro-50 space-y-3 bg-neutro-50/50">
            <div>
              <label className="block text-xs text-neutro-500 mb-1">Ver facturas desde:</label>
              <input
                type="date"
                className="input w-full rounded-xl border-neutro-200 text-sm"
                value={filters.fechaInicio}
                onChange={(e) => onFilterChange('fechaInicio', e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <label className="inline-flex items-center text-xs text-neutro-600 gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded text-primario-600 focus:ring-primario-500"
                  checked={filters.mostrarSinFecha}
                  onChange={(e) => onFilterChange('mostrarSinFecha', e.target.checked)}
                />
                Incluir facturas sin fecha
              </label>
              <button
                type="button"
                className="text-xs text-primario-600 hover:text-primario-800 font-semibold"
                onClick={onClearFilters}
              >
                Resetear Filtros
              </button>
            </div>
          </div>
        </details>
      )}

      {/* Listado de tarjetas de facturas */}
      {facturasMostradas.length === 0 ? (
        <div className="text-center py-12 bg-white border border-dashed rounded-3xl p-6 text-neutro-400">
          {activeTab === 'pendientes' ? (
            <div className="space-y-2">
              <CheckCircle className="mx-auto text-exito-500" size={36} />
              <p className="font-semibold text-neutro-700">¡Todo al día en bodega!</p>
              <p className="text-xs text-neutro-400">No hay facturas pendientes en la cola.</p>
            </div>
          ) : (
            <p className="text-sm">No hay facturas listas registradas.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {facturasMostradas.map((factura) => (
            <div
              key={`${activeTab}-${factura.alegra_id}`}
              className="bg-white border border-neutro-100 rounded-3xl p-5 shadow-sm space-y-4 hover:border-primario-200 transition"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primario-600 bg-primario-50 px-2.5 py-0.5 rounded-full">
                      # {factura.numero_completo || factura.numero_factura}
                    </span>
                    <span className="text-xs text-neutro-400">
                      {formatDate(factura.fecha_emision)}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-neutro-900 whitespace-normal break-words leading-tight">{factura.cliente_nombre}</h3>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-neutro-800">{formatCurrency(factura.total)}</p>
                  <p className="text-xs text-neutro-400">
                    {factura.items ? factura.items.length : 0} ítems
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutro-50">
                {factura.estado_bodega === 'procesado' ? (
                  <div className="flex items-center gap-1.5 text-xs text-exito-600 font-semibold bg-exito-50 px-3 py-1.5 rounded-xl">
                    <CheckCircle size={14} />
                    Completado
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-alerta-600 font-semibold bg-alerta-50 px-3 py-1.5 rounded-xl">
                    <Package size={14} />
                    Pendiente
                  </div>
                )}

                <button
                  onClick={() => onSeleccionarFactura(factura)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.97] active:shadow-none ${factura.estado_bodega === 'procesado'
                    ? 'bg-neutro-100 hover:bg-neutro-200 text-neutro-700'
                    : 'bg-primario-600 hover:bg-primario-700 text-white shadow-md shadow-primario-100'
                    }`}
                >
                  {factura.estado_bodega === 'procesado' ? (
                    <>
                      <Search size={14} />
                      Ver Detalle
                    </>
                  ) : (
                    <>
                      <ArrowRight size={14} />
                      Iniciar Despacho
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
