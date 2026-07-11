import { useState } from 'react'
import { User, Package, RefreshCw, AlertTriangle, Check, ChevronDown } from 'lucide-react'
import { getFacturaEstado, clienteTieneSinCaja } from '../../utils/reporteClientesUtils'

/**
 * Vista de listado (grid) de clientes con búsqueda y filtro por proveedor,
 * más el resumen global al fondo. Extraído de ReporteClientes.jsx (antes
 * renderListaClientes). El estado de búsqueda/filtro es local a esta vista.
 */
export default function ListaClientes({ clientes, resumen, facturasEstado, contarAjustes, onSelectCliente, onRefresh }) {
  const [clienteQuery, setClienteQuery] = useState('')
  const [proveedoresFiltro, setProveedoresFiltro] = useState(new Set())
  const [showProveedorDropdown, setShowProveedorDropdown] = useState(false)

  const sinCajaCount = clientes.filter(c => clienteTieneSinCaja(c, facturasEstado)).length

  // Extraer lista única de proveedores asignados de todos los productos
  const proveedoresDisponibles = [...new Set(
    clientes.flatMap(c =>
      c.facturas_con_faltantes.flatMap(f =>
        f.productos_faltantes
          .filter(p => Number(p.cantidad_faltante) > 0)
          .map(p => p.proveedor_asignado || p.proveedor)
      )
    )
  )].filter(Boolean).sort()

  // Filtrar clientes: mostrar clientes que tengan al menos un producto de los proveedores seleccionados
  const clientesFiltrados = clientes
    .filter(c => c.nombre.toLowerCase().includes(clienteQuery.toLowerCase()))
    .filter(c => {
      if (proveedoresFiltro.size === 0) return true
      // Basta con que al menos un producto pertenezca a los proveedores seleccionados
      return c.facturas_con_faltantes.some(f =>
        f.productos_faltantes.some(p =>
          Number(p.cantidad_faltante) > 0 && proveedoresFiltro.has(p.proveedor_asignado || p.proveedor)
        )
      )
    })

  const toggleProveedor = (prov) => {
    setProveedoresFiltro(prev => {
      const next = new Set(prev)
      if (next.has(prov)) next.delete(prov)
      else next.add(prov)
      return next
    })
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Barra de búsqueda + acciones */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <input type="text" value={clienteQuery} onChange={(e) => setClienteQuery(e.target.value)} placeholder="Buscar cliente..." className="input flex-1 md:max-w-sm bg-gray-50" />
        <div className="flex items-center gap-3">
          {proveedoresFiltro.size > 0 && (
            <button onClick={() => setProveedoresFiltro(new Set())} className="text-xs text-purple-600 hover:text-purple-800 underline whitespace-nowrap">Limpiar filtros ({proveedoresFiltro.size})</button>
          )}
          {sinCajaCount > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-red-700 bg-red-50 px-3 py-1.5 rounded-full font-medium border border-red-200">
              <AlertTriangle size={14} /> {sinCajaCount} sin caja
            </span>
          )}
          <button onClick={onRefresh} className="btn btn-outline"><RefreshCw size={16} className="mr-2" /> Actualizar</button>
        </div>
      </div>

      {/* Filtro por proveedores — dropdown con checkboxes */}
      {proveedoresDisponibles.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowProveedorDropdown(!showProveedorDropdown)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border shadow-sm w-full md:w-auto ${proveedoresFiltro.size > 0
              ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
              : 'bg-white text-gray-700 border-gray-200 hover:border-purple-300'
              }`}
          >
            <Package size={15} />
            {proveedoresFiltro.size > 0 ? `${proveedoresFiltro.size} proveedor${proveedoresFiltro.size > 1 ? 'es' : ''} seleccionado${proveedoresFiltro.size > 1 ? 's' : ''}` : 'Filtrar por proveedor'}
            <ChevronDown size={14} className={`transition-transform ${showProveedorDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showProveedorDropdown && (
            <>
              {/* Overlay para cerrar al hacer click fuera */}
              <div className="fixed inset-0 z-10" onClick={() => setShowProveedorDropdown(false)}></div>

              <div className="absolute z-20 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Proveedores</span>
                  {proveedoresFiltro.size > 0 && (
                    <button onClick={() => setProveedoresFiltro(new Set())} className="text-xs text-purple-600 hover:text-purple-800 font-medium">Limpiar todo</button>
                  )}
                </div>

                {/* Lista de checkboxes */}
                <div className="max-h-60 overflow-y-auto py-1">
                  {proveedoresDisponibles.map(prov => {
                    const isActive = proveedoresFiltro.has(prov)
                    return (
                      <div
                        key={prov}
                        onClick={() => toggleProveedor(prov)}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-gray-50 ${isActive ? 'bg-purple-50' : ''}`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${isActive ? 'bg-purple-600 border-purple-600' : 'border-gray-300'}`}>
                          {isActive && <Check size={10} className="text-white" />}
                        </div>
                        <span className={`text-sm truncate ${isActive ? 'text-purple-800 font-medium' : 'text-gray-700'}`}>{prov}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Footer */}
                <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                  <button
                    onClick={() => setShowProveedorDropdown(false)}
                    className="w-full text-center text-sm text-purple-600 font-medium hover:text-purple-800"
                  >
                    Listo
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Empty State */}
      {clientesFiltrados.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-16">
          <User className="mx-auto text-gray-300 mb-4" size={64} />
          <h3 className="text-xl font-bold text-gray-900 mb-2">{proveedoresFiltro.size > 0 ? 'Sin resultados para estos proveedores' : 'No hay entregas pendientes'}</h3>
          <p className="text-gray-500">{proveedoresFiltro.size > 0 ? 'Prueba con otros proveedores o limpia los filtros.' : 'Cuando registres faltantes en las facturas, aparecerán aquí.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {clientesFiltrados
            .map((cliente, idx) => {
              const esSinCaja = clienteTieneSinCaja(cliente, facturasEstado)
              const procesadas = cliente.facturas_con_faltantes.filter(f => { const e = getFacturaEstado(f, facturasEstado); return e.estado === 'procesado' }).length
              const pendientes = cliente.facturas_con_faltantes.filter(f => { const e = getFacturaEstado(f, facturasEstado); return e.estado === 'pendiente' && e.origen === 'manual' }).length

              return (
                <div
                  key={idx}
                  onClick={() => onSelectCliente(cliente.nombre)}
                  className={`group bg-white rounded-xl shadow-sm hover:shadow-lg border p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden ${esSinCaja ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-100'
                    }`}
                >
                  <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-[100px] -z-10 group-hover:bg-purple-100 transition-colors"></div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2.5 rounded-lg ${esSinCaja ? 'bg-red-100' : 'bg-purple-100'}`}>
                      <User className={esSinCaja ? 'text-red-600' : 'text-purple-600'} size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-gray-900 truncate">{cliente.nombre}</h3>
                      {cliente.email && <p className="text-xs text-gray-500 truncate">{cliente.email}</p>}
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {esSinCaja && (
                      <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold uppercase">📦 Sin Caja</span>
                    )}
                    {procesadas > 0 && (
                      <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">✓ {procesadas} procesada{procesadas > 1 ? 's' : ''}</span>
                    )}
                    {pendientes > 0 && (
                      <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">⏳ {pendientes} pendiente{pendientes > 1 ? 's' : ''}</span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 pt-3 border-t border-gray-50">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Facturas</p>
                      <p className="text-xl font-bold text-gray-800">{cliente.facturas_con_faltantes.length}</p>
                    </div>
                    <div className="h-8 w-[1px] bg-gray-200"></div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Pendientes</p>
                      <p className="text-xl font-bold text-purple-600">{cliente.total_cantidad}</p>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* Resumen Global */}
      {resumen && (
        <div className="mt-8 pt-6 border-t border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4 opacity-70">
          <div className="text-center"><p className="text-sm text-gray-500">Clientes</p><p className="text-xl font-bold text-gray-800">{clientes.length}</p></div>
          <div className="text-center"><p className="text-sm text-gray-500">Facturas Afectadas</p><p className="text-xl font-bold text-gray-800">{resumen.total_facturas_afectadas}</p></div>
          <div className="text-center"><p className="text-sm text-gray-500">Productos Pendientes</p><p className="text-xl font-bold text-gray-800">{resumen.total_cantidad_faltante}</p></div>
          <div className="text-center"><p className="text-sm text-gray-500">Ajustes Hechos</p><p className="text-xl font-bold text-gray-800">{contarAjustes()}</p></div>
        </div>
      )}
    </div>
  )
}
