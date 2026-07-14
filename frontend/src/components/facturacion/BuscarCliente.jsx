import { Users, Search, X, Plus } from 'lucide-react'

/**
 * Paso 1 de facturación: buscar y seleccionar el cliente. Extraído de
 * Facturacion.jsx.
 */
export default function BuscarCliente({
  isMobile,
  cardRef,
  busquedaCliente,
  onBusquedaClienteChange,
  onFocusBusqueda,
  onLimpiarBusqueda,
  clientesEncontrados,
  onSeleccionarCliente
}) {
  return (
    <div className={`${isMobile ? 'px-4' : 'max-w-3xl mx-auto'} mb-6`}>
      <div ref={cardRef} className="card shadow-xl border-2 border-blue-100 p-6 md:p-8 bg-white rounded-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex p-4 bg-blue-50 text-blue-600 rounded-full mb-3">
            <Users size={isMobile ? 32 : 40} />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Buscar Cliente</h2>
          <p className="text-gray-500 text-sm md:text-base mt-1">Busca y selecciona un cliente para comenzar a facturar</p>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={24} />
          <input
            type="text"
            value={busquedaCliente}
            onChange={(e) => onBusquedaClienteChange(e.target.value)}
            onFocus={onFocusBusqueda}
            placeholder="Escribe el nombre del cliente..."
            className="input w-full pl-12 pr-12 py-4 text-lg border-2 border-gray-300 focus:border-blue-500 rounded-xl"
            style={{ fontSize: '18px', height: '56px' }}
            autoFocus
          />
          {busquedaCliente && (
            <button
              onClick={onLimpiarBusqueda}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
              <X size={22} />
            </button>
          )}
        </div>

        {/* Resultados búsqueda clientes */}
        {clientesEncontrados.length > 0 && (
          <div className="mt-4 border-2 border-gray-200 rounded-xl max-h-[350px] overflow-y-auto divide-y divide-gray-100 shadow-md">
            {clientesEncontrados.map((cliente) => (
              <button
                key={cliente.id}
                onClick={() => onSeleccionarCliente(cliente)}
                className={`w-full text-left ${isMobile ? 'p-6 py-6 border-2 border-blue-50 bg-blue-50/20' : 'p-4'} rounded-xl hover:bg-blue-50 active:bg-blue-100 transition-colors flex items-center justify-between gap-4 mb-2`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`font-black text-gray-950 ${isMobile ? 'text-sm' : 'text-lg md:text-sm'} leading-snug`}>{cliente.name}</p>
                  <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-2 text-gray-700 ${isMobile ? 'text-base font-medium' : 'text-sm'}`}>
                    {cliente.identification && (
                      <span>Cédula: <strong>{cliente.identification}</strong></span>
                    )}
                    {cliente.email && (
                      <span className="truncate">{cliente.email}</span>
                    )}
                  </div>
                </div>
                <div className={`p-3 bg-blue-100 text-blue-700 rounded-xl flex-shrink-0 ${isMobile ? 'p-4' : ''}`}>
                  <Plus size={isMobile ? 24 : 20} strokeWidth={3} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
