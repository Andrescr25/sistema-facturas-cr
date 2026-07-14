import { Package, Users, Receipt } from 'lucide-react'

/**
 * Tarjetas de estadísticas del cache local (productos, clientes,
 * facturas pendientes). Extraído de Facturacion.jsx.
 */
export default function StatsCache({ isMobile, cacheStats }) {
  return (
    <div className={`${isMobile ? 'px-4 mb-4' : 'mb-6'}`}>
      <div className={`${isMobile
        ? 'flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 scrollbar-hide'
        : 'grid grid-cols-1 md:grid-cols-3 gap-4'
        }`}>
        <div className={`${isMobile ? 'flex-shrink-0 w-64 snap-start' : ''} card`}>
          <div className="flex items-center gap-3">
            <div className={`${isMobile ? 'p-2' : 'p-2'} bg-blue-100 rounded-lg`}>
              <Package className="text-blue-600" size={isMobile ? 20 : 24} />
            </div>
            <div>
              <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600`}>Productos</p>
              <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold`}>{cacheStats.productos.total}</p>
              {!isMobile && cacheStats.productos.ultimaActualizacion && (
                <p className="text-xs text-gray-500">
                  {new Date(cacheStats.productos.ultimaActualizacion).toLocaleDateString('es-CR')}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className={`${isMobile ? 'flex-shrink-0 w-64 snap-start' : ''} card`}>
          <div className="flex items-center gap-3">
            <div className={`${isMobile ? 'p-2' : 'p-2'} bg-green-100 rounded-lg`}>
              <Users className="text-green-600" size={isMobile ? 20 : 24} />
            </div>
            <div>
              <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600`}>Clientes</p>
              <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold`}>{cacheStats.clientes.total}</p>
              {!isMobile && cacheStats.clientes.ultimaActualizacion && (
                <p className="text-xs text-gray-500">
                  {new Date(cacheStats.clientes.ultimaActualizacion).toLocaleDateString('es-CR')}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className={`${isMobile ? 'flex-shrink-0 w-64 snap-start' : ''} card`}>
          <div className="flex items-center gap-3">
            <div className={`${isMobile ? 'p-2' : 'p-2'} bg-purple-100 rounded-lg`}>
              <Receipt className="text-purple-600" size={isMobile ? 20 : 24} />
            </div>
            <div>
              <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600`}>Pendientes</p>
              <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold`}>{cacheStats.facturasPendientes}</p>
              <p className={`${isMobile ? 'text-xs' : 'text-xs'} text-gray-500`}>Por sincronizar</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
