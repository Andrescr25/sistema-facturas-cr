import { Calendar, RefreshCw, Package, Check } from 'lucide-react'

/**
 * Vista de listado (grid) de proveedores con búsqueda, filtro de fecha y
 * resumen global. La página conserva la búsqueda: la descarga usa el mismo
 * filtro y volver de un proveedor no lo pierde.
 *
 * LA MARCA DE "YA SE LE MANDÓ"
 * `pedidosEnviados` es un Map de nombre de proveedor a la fecha del último
 * envío por WhatsApp dentro del período del reporte. Sale del registro del
 * servidor, no del navegador, así que la marca también la ve quien abra el
 * reporte desde otra máquina — que es justo cuando se manda el pedido dos
 * veces sin querer.
 *
 * Solo cuenta lo que salió bien: un intento fallido no es un pedido enviado.
 */
export default function ListaProveedores({ proveedores, pedidosEnviados, resumen, fechaInicio, setFechaInicio, onRefresh, onSelectProveedor, proveedorQuery, setProveedorQuery, consultaCiclo = false }) {

  const cuandoSeEnvio = (fecha) =>
    new Date(fecha).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })

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
          {proveedores.filter(p => p.nombre.toLowerCase().includes(proveedorQuery.toLowerCase())).map((proveedor) => {
            const enviado = pedidosEnviados?.get(proveedor.nombre)
            return (
            <button
              type="button"
              key={proveedor.id}
              onClick={() => onSelectProveedor(proveedor.id)}
              className={`group min-w-0 text-left bg-white rounded-xl shadow-sm hover:shadow-lg border p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden ${
                enviado ? 'border-exito-200 ring-1 ring-exito-100' : 'border-neutro-100'
              }`}
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-primario-50 rounded-bl-[100px] -z-10 group-hover:bg-primario-100 transition-colors"></div>

              <h3 className="text-lg font-bold text-neutro-900 mb-1 pr-4">{proveedor.nombre}</h3>
              <p className="text-sm text-neutro-500 mb-3">{proveedor.contacto || 'Sin info'}</p>

              {/* Ya se le mandó el pedido en este período. Va antes de los
                  números porque la pregunta al recorrer la lista es "¿a
                  quién le falta?", no "¿cuántos productos tiene?". */}
              {consultaCiclo ? <p className="mb-4 text-xs font-semibold text-nota-700">Faltantes del ciclo seleccionado</p> : enviado ? (
                <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-exito-50 px-2.5 py-1 text-xs font-bold text-exito-700 ring-1 ring-exito-200">
                  <Check size={13} strokeWidth={3} />
                  Pedido enviado {cuandoSeEnvio(enviado.ultimoEnvio)}
                  {enviado.veces > 1 && (
                    <span className="font-semibold text-exito-600">· {enviado.veces} veces</span>
                  )}
                </div>
              ) : (
                <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-neutro-100 px-2.5 py-1 text-xs font-semibold text-neutro-500">
                  Sin enviar
                </div>
              )}

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
            </button>
            )
          })}
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
