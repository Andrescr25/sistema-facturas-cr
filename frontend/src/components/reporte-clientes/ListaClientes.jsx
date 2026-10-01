import { useState } from 'react'
import { User, Package, RefreshCw, AlertTriangle, Check, ChevronDown, Search } from 'lucide-react'
import {
  getClienteProgreso, ordenClienteProgreso, clienteTieneSinCaja, CLIENTE_ESTADO,
  FILTROS_VACIOS, hayFiltros, filtrarClientes, productosQueCoinciden
} from '../../utils/reporteClientesUtils'

// Cómo se ve cada estado de la card. La alerta de "sin caja" se superpone a
// todos porque es la que no se puede pasar por alto.
const ESTILO_ESTADO = {
  [CLIENTE_ESTADO.EN_PROGRESO]: {
    card: 'border-alerta-300 bg-alerta-50/40 ring-1 ring-alerta-100',
    icono: 'bg-alerta-100',
    iconoColor: 'text-alerta-600'
  },
  [CLIENTE_ESTADO.LISTO_PARA_PROCESAR]: {
    card: 'border-primario-200 bg-primario-50/30',
    icono: 'bg-primario-100',
    iconoColor: 'text-primario-600'
  },
  [CLIENTE_ESTADO.SIN_EMPEZAR]: {
    card: 'border-neutro-100',
    icono: 'bg-nota-100',
    iconoColor: 'text-nota-600'
  },
  [CLIENTE_ESTADO.LISTA]: {
    card: 'border-exito-200 bg-exito-50/30',
    icono: 'bg-exito-100',
    iconoColor: 'text-exito-600'
  }
}

const ESTILO_SIN_CAJA = {
  card: 'border-peligro-200 ring-1 ring-peligro-100',
  icono: 'bg-peligro-100',
  iconoColor: 'text-peligro-600'
}

/**
 * Vista de listado (grid) de clientes con búsqueda por cliente y por
 * producto, y filtro por proveedor, más el resumen global al fondo.
 *
 * LOS FILTROS LOS GUARDA LA PÁGINA (`filtros`/`onFiltrosChange`), no esta
 * vista: se desmonta al entrar a un cliente, y con el estado acá adentro
 * volvían vacíos al regresar a la lista (2026-10-01).
 *
 * Las cards se ordenan por urgencia (sin caja → en progreso → listo para
 * procesar → sin empezar) y las ya terminadas bajan a su propia sección.
 */
export default function ListaClientes({ clientes, resumen, facturasEstado, entregasAjustadas, contarAjustes, filtros, onFiltrosChange, onSelectCliente, onRefresh }) {
  const [showProveedorDropdown, setShowProveedorDropdown] = useState(false)
  const proveedoresFiltro = new Set(filtros.proveedores)
  const cambiar = (cambio) => onFiltrosChange({ ...filtros, ...cambio })
  const filtrando = hayFiltros(filtros)
  const cantidadFiltros = [filtros.cliente.trim(), filtros.producto.trim()].filter(Boolean).length + filtros.proveedores.length

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

  const clientesFiltrados = filtrarClientes(clientes, filtros)
    .map(cliente => ({
      cliente,
      progreso: getClienteProgreso(cliente, facturasEstado, entregasAjustadas),
      coincidencias: productosQueCoinciden(cliente, filtros.producto)
    }))
    .sort((a, b) => {
      const orden = ordenClienteProgreso(a.progreso) - ordenClienteProgreso(b.progreso)
      return orden !== 0 ? orden : a.cliente.nombre.localeCompare(b.cliente.nombre)
    })

  const clientesPendientes = clientesFiltrados.filter(({ progreso }) => progreso.estado !== CLIENTE_ESTADO.LISTA)
  const clientesListos = clientesFiltrados.filter(({ progreso }) => progreso.estado === CLIENTE_ESTADO.LISTA)

  const toggleProveedor = (prov) => {
    cambiar({ proveedores: proveedoresFiltro.has(prov) ? filtros.proveedores.filter(p => p !== prov) : [...filtros.proveedores, prov] })
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Barra de búsqueda + acciones */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-neutro-100">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 lg:max-w-sm">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400 pointer-events-none" />
            <input type="text" value={filtros.cliente} onChange={(e) => cambiar({ cliente: e.target.value })} placeholder="Buscar cliente..." aria-label="Buscar cliente" className="input w-full pl-9 bg-neutro-50" />
          </div>
          <div className="relative flex-1 lg:max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400 pointer-events-none" />
            <input type="text" value={filtros.producto} onChange={(e) => cambiar({ producto: e.target.value })} placeholder="Buscar producto (nombre o código)..." aria-label="Buscar producto" className="input w-full pl-9 bg-neutro-50" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {filtrando && (
            <button onClick={() => onFiltrosChange(FILTROS_VACIOS)} className="text-xs text-nota-600 hover:text-nota-800 underline whitespace-nowrap">Limpiar filtros ({cantidadFiltros})</button>
          )}
          {sinCajaCount > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-peligro-700 bg-peligro-50 px-3 py-1.5 rounded-full font-medium border border-peligro-200 whitespace-nowrap">
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
              ? 'bg-nota-600 text-white border-nota-600 hover:bg-nota-700'
              : 'bg-white text-neutro-700 border-neutro-200 hover:border-nota-300'
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

              <div className="absolute z-20 mt-2 w-72 bg-white rounded-xl shadow-lg border border-neutro-200 overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-4 py-3 border-b border-neutro-100 flex items-center justify-between">
                  <span className="text-xs text-neutro-400 uppercase tracking-wider font-semibold">Proveedores</span>
                  {proveedoresFiltro.size > 0 && (
                    <button onClick={() => cambiar({ proveedores: [] })} className="text-xs text-nota-600 hover:text-nota-800 font-medium">Limpiar todo</button>
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
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-neutro-50 ${isActive ? 'bg-nota-50' : ''}`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${isActive ? 'bg-nota-600 border-nota-600' : 'border-neutro-300'}`}>
                          {isActive && <Check size={10} className="text-white" />}
                        </div>
                        <span className={`text-sm truncate ${isActive ? 'text-nota-800 font-medium' : 'text-neutro-700'}`}>{prov}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Footer */}
                <div className="px-4 py-2.5 border-t border-neutro-100 bg-neutro-50">
                  <button
                    onClick={() => setShowProveedorDropdown(false)}
                    className="w-full text-center text-sm text-nota-600 font-medium hover:text-nota-800"
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
        <div className="bg-white rounded-xl shadow-sm border border-neutro-100 text-center py-16">
          <User className="mx-auto text-neutro-300 mb-4" size={64} />
          <h3 className="text-xl font-bold text-neutro-900 mb-2">{filtrando ? 'Ningún cliente coincide con la búsqueda' : 'No hay entregas pendientes'}</h3>
          <p className="text-neutro-500">{filtrando ? 'Probá con otro texto u otros proveedores, o limpiá los filtros.' : 'Cuando registres faltantes en las facturas, aparecerán aquí.'}</p>
        </div>
      ) : (
        <>
          {/* Clientes con trabajo pendiente */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {clientesPendientes.map(({ cliente, progreso, coincidencias }) => (
              <ClienteCard
                key={cliente.nombre}
                cliente={cliente}
                progreso={progreso}
                coincidencias={coincidencias}
                onSelectCliente={onSelectCliente}
              />
            ))}
          </div>

          {/* Divisor + clientes ya terminados al fondo */}
          {clientesListos.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-[1px] flex-1 bg-neutro-200" />
                <span className="text-xs text-neutro-400 uppercase tracking-widest font-semibold flex items-center gap-1.5 whitespace-nowrap">
                  <Check size={12} /> {clientesListos.length} cliente{clientesListos.length !== 1 ? 's' : ''} listo{clientesListos.length !== 1 ? 's' : ''}
                </span>
                <div className="h-[1px] flex-1 bg-neutro-200" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {clientesListos.map(({ cliente, progreso, coincidencias }) => (
                  <ClienteCard
                    key={cliente.nombre}
                    cliente={cliente}
                    progreso={progreso}
                    coincidencias={coincidencias}
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
        <div className="mt-8 pt-6 border-t border-neutro-200 grid grid-cols-1 md:grid-cols-4 gap-4 opacity-70">
          <div className="text-center"><p className="text-sm text-neutro-500">Clientes</p><p className="text-xl font-bold text-neutro-800">{clientes.length}</p></div>
          <div className="text-center"><p className="text-sm text-neutro-500">Facturas Afectadas</p><p className="text-xl font-bold text-neutro-800">{resumen.total_facturas_afectadas}</p></div>
          <div className="text-center"><p className="text-sm text-neutro-500">Productos Pendientes</p><p className="text-xl font-bold text-neutro-800">{resumen.total_cantidad_faltante}</p></div>
          <div className="text-center"><p className="text-sm text-neutro-500">Ajustes Hechos</p><p className="text-xl font-bold text-neutro-800">{contarAjustes()}</p></div>
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
function ClienteCard({ cliente, progreso, coincidencias = [], onSelectCliente }) {
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
          <h3 className="text-lg font-bold text-neutro-900 truncate">{cliente.nombre}</h3>
          {cliente.email && <p className="text-xs text-neutro-500 truncate">{cliente.email}</p>}
        </div>
      </div>

      {/* Estado dicho en palabras */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {progreso.esSinCaja && (
          <span className="text-[10px] bg-peligro-500 text-white px-2 py-0.5 rounded-full font-bold uppercase">📦 Sin Caja</span>
        )}
        {progreso.estado === CLIENTE_ESTADO.EN_PROGRESO && (
          <span className="text-[11px] bg-alerta-400 text-alerta-950 px-2.5 py-0.5 rounded-full font-bold">
            ⏳ {progreso.porRevisar} producto{progreso.porRevisar !== 1 ? 's' : ''} pendiente{progreso.porRevisar !== 1 ? 's' : ''}
          </span>
        )}
        {progreso.estado === CLIENTE_ESTADO.LISTO_PARA_PROCESAR && (
          <span className="text-[11px] bg-primario-100 text-primario-800 px-2.5 py-0.5 rounded-full font-semibold">
            ✓ Todo revisado — falta enviar a impresión
          </span>
        )}
        {progreso.estado === CLIENTE_ESTADO.SIN_EMPEZAR && (
          <span className="text-[11px] bg-neutro-100 text-neutro-600 px-2.5 py-0.5 rounded-full font-medium">
            {progreso.total} producto{progreso.total !== 1 ? 's' : ''} por revisar
          </span>
        )}
        {esLista && (
          <span className="text-[11px] bg-exito-100 text-exito-800 px-2.5 py-0.5 rounded-full font-semibold">✓ Lista</span>
        )}
      </div>

      {/* Buscando por producto: cuáles de esos le faltan a este cliente */}
      {coincidencias.length > 0 && (
        <div className="mb-3 rounded-lg bg-nota-50 border border-nota-100 px-3 py-2 space-y-1">
          {coincidencias.slice(0, 3).map(p => (
            <div key={p.codigo || p.nombre} className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="font-semibold text-nota-900 truncate">{p.nombre}</span>
              <span className="text-nota-700 font-bold whitespace-nowrap">faltan {p.cantidad}</span>
            </div>
          ))}
          {coincidencias.length > 3 && (
            <p className="text-[11px] text-nota-600">y {coincidencias.length - 3} producto{coincidencias.length - 3 !== 1 ? 's' : ''} más</p>
          )}
        </div>
      )}

      {/* Progreso de revisión — solo cuando ya se empezó */}
      {progreso.revisados > 0 && progreso.total > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-neutro-500 font-medium">{progreso.revisados} de {progreso.total} revisados</span>
            <span className="text-neutro-400">{Math.round((progreso.revisados / progreso.total) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full bg-neutro-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progreso.porRevisar === 0 ? 'bg-exito-500' : 'bg-alerta-400'}`}
              style={{ width: `${Math.round((progreso.revisados / progreso.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 pt-3 border-t border-neutro-100">
        <div>
          <p className="text-xs text-neutro-400 uppercase tracking-wider font-semibold">Facturas</p>
          <p className="text-xl font-bold text-neutro-800">{cliente.facturas_con_faltantes.length}</p>
        </div>
        <div className="h-8 w-[1px] bg-neutro-200"></div>
        <div>
          <p className="text-xs text-neutro-400 uppercase tracking-wider font-semibold">Unidades</p>
          <p className={`text-xl font-bold ${esLista ? 'text-exito-600' : 'text-nota-600'}`}>{cliente.total_cantidad}</p>
        </div>
      </div>
    </div>
  )
}
