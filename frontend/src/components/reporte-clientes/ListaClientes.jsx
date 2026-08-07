import { useState } from 'react'
import { User, Package, RefreshCw, AlertTriangle, Check, ChevronDown } from 'lucide-react'
import { getClienteProgreso, ordenClienteProgreso, clienteTieneSinCaja, CLIENTE_ESTADO } from '../../utils/reporteClientesUtils'

// Cómo se ve cada estado de la card. La alerta de "sin caja" se superpone a
// todos porque es la que no se puede pasar por alto.
const ESTILO_ESTADO = {
  [CLIENTE_ESTADO.EN_PROGRESO]: {
    card: 'border-amber-300 bg-amber-50/40 ring-1 ring-amber-100',
    icono: 'bg-amber-100',
    iconoColor: 'text-amber-600'
  },
  [CLIENTE_ESTADO.LISTO_PARA_PROCESAR]: {
    card: 'border-blue-200 bg-blue-50/30',
    icono: 'bg-blue-100',
    iconoColor: 'text-blue-600'
  },
  [CLIENTE_ESTADO.SIN_EMPEZAR]: {
    card: 'border-gray-100',
    icono: 'bg-purple-100',
    iconoColor: 'text-purple-600'
  },
  [CLIENTE_ESTADO.LISTA]: {
    card: 'border-green-200 bg-green-50/30',
    icono: 'bg-green-100',
    iconoColor: 'text-green-600'
  }
}

const ESTILO_SIN_CAJA = {
  card: 'border-red-200 ring-1 ring-red-100',
  icono: 'bg-red-100',
  iconoColor: 'text-red-600'
}

/**
 * Vista de listado (grid) de clientes con búsqueda y filtro por proveedor,
 * más el resumen global al fondo. Extraído de ReporteClientes.jsx (antes
 * renderListaClientes). El estado de búsqueda/filtro es local a esta vista.
 *
 * Las cards se ordenan por urgencia (sin caja → en progreso → listo para
 * procesar → sin empezar) y las ya terminadas bajan a su propia sección.
 */
export default function ListaClientes({ clientes, resumen, facturasEstado, entregasAjustadas, contarAjustes, onSelectCliente, onRefresh }) {
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
    .map(cliente => ({ cliente, progreso: getClienteProgreso(cliente, facturasEstado, entregasAjustadas) }))
    .sort((a, b) => {
      const orden = ordenClienteProgreso(a.progreso) - ordenClienteProgreso(b.progreso)
      return orden !== 0 ? orden : a.cliente.nombre.localeCompare(b.cliente.nombre)
    })

  const clientesPendientes = clientesFiltrados.filter(({ progreso }) => progreso.estado !== CLIENTE_ESTADO.LISTA)
  const clientesListos = clientesFiltrados.filter(({ progreso }) => progreso.estado === CLIENTE_ESTADO.LISTA)

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
        <>
          {/* Clientes con trabajo pendiente */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {clientesPendientes.map(({ cliente, progreso }) => (
              <ClienteCard
                key={cliente.nombre}
                cliente={cliente}
                progreso={progreso}
                onSelectCliente={onSelectCliente}
              />
            ))}
          </div>

          {/* Divisor + clientes ya terminados al fondo */}
          {clientesListos.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-[1px] flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold flex items-center gap-1.5 whitespace-nowrap">
                  <Check size={12} /> {clientesListos.length} cliente{clientesListos.length !== 1 ? 's' : ''} listo{clientesListos.length !== 1 ? 's' : ''}
                </span>
                <div className="h-[1px] flex-1 bg-gray-200" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {clientesListos.map(({ cliente, progreso }) => (
                  <ClienteCard
                    key={cliente.nombre}
                    cliente={cliente}
                    progreso={progreso}
                    onSelectCliente={onSelectCliente}
                  />
                ))}
              </div>
            </div>
          )}
        </>
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

/**
 * Card de un cliente. El color y el mensaje salen de su progreso real de
 * revisión, para que de un vistazo se sepa si hay que entrarle, si solo falta
 * enviarla a impresión, o si ya está terminada.
 */
function ClienteCard({ cliente, progreso, onSelectCliente }) {
  const estilo = progreso.esSinCaja
    ? ESTILO_SIN_CAJA
    : (ESTILO_ESTADO[progreso.estado] || ESTILO_ESTADO[CLIENTE_ESTADO.SIN_EMPEZAR])

  const esLista = progreso.estado === CLIENTE_ESTADO.LISTA

  return (
    <div
      onClick={() => onSelectCliente(cliente.nombre)}
      className={`group bg-white rounded-xl shadow-sm hover:shadow-lg border p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden ${estilo.card} ${esLista ? 'opacity-75 hover:opacity-100' : ''}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-lg ${estilo.icono}`}>
          <User className={estilo.iconoColor} size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-900 truncate">{cliente.nombre}</h3>
          {cliente.email && <p className="text-xs text-gray-500 truncate">{cliente.email}</p>}
        </div>
      </div>

      {/* Estado dicho en palabras */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {progreso.esSinCaja && (
          <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold uppercase">📦 Sin Caja</span>
        )}
        {progreso.estado === CLIENTE_ESTADO.EN_PROGRESO && (
          <span className="text-[11px] bg-amber-400 text-amber-950 px-2.5 py-0.5 rounded-full font-bold">
            ⏳ {progreso.porRevisar} producto{progreso.porRevisar !== 1 ? 's' : ''} pendiente{progreso.porRevisar !== 1 ? 's' : ''}
          </span>
        )}
        {progreso.estado === CLIENTE_ESTADO.LISTO_PARA_PROCESAR && (
          <span className="text-[11px] bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full font-semibold">
            ✓ Todo revisado — falta enviar a impresión
          </span>
        )}
        {progreso.estado === CLIENTE_ESTADO.SIN_EMPEZAR && (
          <span className="text-[11px] bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-medium">
            {progreso.total} producto{progreso.total !== 1 ? 's' : ''} por revisar
          </span>
        )}
        {esLista && (
          <span className="text-[11px] bg-green-100 text-green-800 px-2.5 py-0.5 rounded-full font-semibold">✓ Lista</span>
        )}
      </div>

      {/* Progreso de revisión — solo cuando ya se empezó */}
      {progreso.revisados > 0 && progreso.total > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-gray-500 font-medium">{progreso.revisados} de {progreso.total} revisados</span>
            <span className="text-gray-400">{Math.round((progreso.revisados / progreso.total) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progreso.porRevisar === 0 ? 'bg-green-500' : 'bg-amber-400'}`}
              style={{ width: `${Math.round((progreso.revisados / progreso.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Facturas</p>
          <p className="text-xl font-bold text-gray-800">{cliente.facturas_con_faltantes.length}</p>
        </div>
        <div className="h-8 w-[1px] bg-gray-200"></div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Unidades</p>
          <p className={`text-xl font-bold ${esLista ? 'text-green-600' : 'text-purple-600'}`}>{cliente.total_cantidad}</p>
        </div>
      </div>
    </div>
  )
}
