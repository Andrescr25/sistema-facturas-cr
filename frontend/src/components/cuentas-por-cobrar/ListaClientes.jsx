import { Users, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '../../utils/cuentasPorCobrarUtils'

/**
 * Grid de clientes con saldo pendiente. El filtrado (estado/fecha/búsqueda)
 * ya viene resuelto por el backend vía FiltrosCuentas — este componente solo
 * pinta lo que recibe. De reporte-clientes/ListaClientes.jsx, simplificado
 * (sin dropdown de filtro propio, eso vive en FiltrosCuentas.jsx).
 */
export default function ListaClientes({ clientes, onSelectCliente }) {
  if (clientes.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutro-100 text-center py-16">
        <Users className="mx-auto text-neutro-300 mb-4" size={64} />
        <h3 className="text-xl font-bold text-neutro-900 mb-2">No hay clientes con saldo pendiente</h3>
        <p className="text-neutro-500">Cuando haya facturas de venta con saldo, aparecerán acá.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {clientes.map((cliente) => {
        const tieneVencidas = cliente.facturas.some((f) => f.estado === 'VENCIDA')
        return (
          <div
            key={cliente.clienteId}
            onClick={() => onSelectCliente(cliente.clienteId)}
            className={`group bg-white rounded-xl shadow-sm hover:shadow-lg border p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden ${
              tieneVencidas ? 'border-peligro-200 ring-1 ring-peligro-100' : 'border-neutro-100'
            }`}
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-primario-50 rounded-bl-[100px] -z-10 group-hover:bg-primario-100 transition-colors" />

            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2.5 rounded-lg ${tieneVencidas ? 'bg-peligro-100' : 'bg-primario-100'}`}>
                <Users className={tieneVencidas ? 'text-peligro-600' : 'text-primario-600'} size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-neutro-900 truncate">{cliente.clienteNombre}</h3>
              </div>
            </div>

            {tieneVencidas && (
              <div className="mb-3">
                <span className="text-[10px] bg-peligro-500 text-white px-2 py-0.5 rounded-full font-bold uppercase inline-flex items-center gap-1">
                  <AlertTriangle size={10} /> Tiene facturas vencidas
                </span>
              </div>
            )}

            <div className="flex items-center gap-4 pt-3 border-t border-neutro-50">
              <div>
                <p className="text-xs text-neutro-400 uppercase tracking-wider font-semibold">Facturas</p>
                <p className="text-xl font-bold text-neutro-800">{cliente.facturas.length}</p>
              </div>
              <div className="h-8 w-[1px] bg-neutro-200" />
              <div>
                <p className="text-xs text-neutro-400 uppercase tracking-wider font-semibold">Saldo total</p>
                <p className="text-xl font-bold text-primario-600">{formatCurrency(cliente.totalSaldo)}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
