import { useState } from 'react'
import { Calendar, RefreshCw, Package } from 'lucide-react'

/**
 * Vista de listado (grid) de proveedores con búsqueda, filtro de fecha y
 * resumen global. Extraído de ReporteProveedores.jsx (antes
 * renderVistaLista). El texto de búsqueda es local a esta vista.
 */
export default function ListaProveedores({ proveedores, resumen, fechaInicio, setFechaInicio, onRefresh, onSelectProveedor }) {
  const [proveedorQuery, setProveedorQuery] = useState('')

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Filtros Globales */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-neutro-100">
        <div className="flex-1 w-full">
          <input type="text" value={proveedorQuery} onChange={(e) => setProveedorQuery(e.target.value)} placeholder="Buscar nombre del proveedor..." className="input w-full md:max-w-md bg-neutro-50" />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-neutro-50 border border-neutro-200 rounded-lg px-3 py-2">
            <Calendar size={16} className="text-neutro-500 mr-2" />
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="text-sm bg-transparent border-none focus:ring-0 p-0 text-neutro-700" title="Fecha inicial" />
            {fechaInicio && <button onClick={() => setFechaInicio('')} className="ml-2 text-neutro-400 hover:text-peligro-500">&times;</button>}
          </div>
          <button onClick={onRefresh} className="btn btn-outline" title="Refrescar">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Grid de Proveedores */}
      {proveedores.length === 0 ? (
        <div className="card text-center py-16">
          <Package className="mx-auto text-neutro-300 mb-4" size={64} />
          <h3 className="text-xl font-bold text-neutro-900 mb-2">No tienes faltantes pendientes</h3>
          <p className="text-neutro-500">Agrega Faltantes desde la vista de facturas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {proveedores.filter(p => p.nombre.toLowerCase().includes(proveedorQuery.toLowerCase())).map((proveedor) => (
            <div
              key={proveedor.id}
              onClick={() => onSelectProveedor(proveedor.id)}
              className="group bg-white rounded-xl shadow-sm hover:shadow-lg border border-neutro-100 p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-primario-50 rounded-bl-[100px] -z-10 group-hover:bg-primario-100 transition-colors"></div>

              <h3 className="text-lg font-bold text-neutro-900 mb-1 pr-4">{proveedor.nombre}</h3>
              <p className="text-sm text-neutro-500 mb-4">{proveedor.contacto || 'Sin info'}</p>

              <div className="flex items-center gap-4 pt-4 border-t border-neutro-50">
                <div>
                  <p className="text-xs text-neutro-400 uppercase tracking-wider font-semibold">Productos</p>
                  <p className="text-xl font-bold text-neutro-800">{proveedor.total_productos}</p>
                </div>
                <div className="h-8 w-[1px] bg-neutro-200"></div>
                <div>
                  <p className="text-xs text-neutro-400 uppercase tracking-wider font-semibold">Unidades</p>
                  <p className="text-xl font-bold text-primario-600">{proveedor.total_cantidad}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resumen Global Info */}
      {resumen && (
        <div className="mt-8 pt-6 border-t border-neutro-200 grid grid-cols-1 md:grid-cols-3 gap-4 opacity-70">
          <div className="text-center"><p className="text-sm text-neutro-500">Proveedores con faltantes</p><p className="text-xl font-bold text-neutro-800">{proveedores.length}</p></div>
          <div className="text-center"><p className="text-sm text-neutro-500">Tot. Productos Únicos</p><p className="text-xl font-bold text-neutro-800">{resumen.total_productos_faltantes}</p></div>
          <div className="text-center"><p className="text-sm text-neutro-500">Volumen Unidades</p><p className="text-xl font-bold text-neutro-800">{resumen.total_cantidad_faltante}</p></div>
        </div>
      )}
    </div>
  )
}
