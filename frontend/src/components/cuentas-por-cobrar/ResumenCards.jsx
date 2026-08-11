import { AlertTriangle, Clock, Users, Wallet } from 'lucide-react'
import { formatCurrency } from '../../utils/cuentasPorCobrarUtils'

/**
 * Tarjetas de resumen del estado general de cuentas por cobrar. "Vencidas" y
 * "Próximos 7 días" son accesos directos: al hacer click aplican ese filtro
 * de un solo golpe. De pagos-proveedores/ResumenCards.jsx.
 */
export default function ResumenCards({ resumen, filters, setFilters }) {
  if (!resumen) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="card">
        <p className="text-sm text-gray-500 flex items-center gap-1.5">
          <Wallet size={14} className="text-blue-500" />
          Total por cobrar
        </p>
        <p className="text-2xl font-semibold text-gray-900 mt-1">{formatCurrency(resumen.totalPorCobrar)}</p>
        <span className="text-xs text-gray-500">{resumen.totalFacturas} factura{resumen.totalFacturas !== 1 ? 's' : ''} abierta{resumen.totalFacturas !== 1 ? 's' : ''}</span>
      </div>

      <button
        type="button"
        onClick={() => setFilters((prev) => ({ ...prev, estado: prev.estado === 'VENCIDA' ? 'todos' : 'VENCIDA' }))}
        className={`card text-left transition hover:shadow-md hover:border-red-300 ${filters.estado === 'VENCIDA' ? 'ring-2 ring-red-400 border-red-300' : ''}`}
      >
        <p className="text-sm text-gray-500 flex items-center gap-1.5">
          <AlertTriangle size={14} className="text-red-500" />
          Vencido
        </p>
        <p className="text-2xl font-semibold text-red-600 mt-1">{formatCurrency(resumen.totalVencido)}</p>
        <span className="text-xs text-gray-500">Click para filtrar</span>
      </button>

      <button
        type="button"
        onClick={() => setFilters((prev) => ({ ...prev, estado: 'todos', dias: prev.dias === 'vence7' ? 'todos' : 'vence7' }))}
        className={`card text-left transition hover:shadow-md hover:border-orange-300 ${filters.dias === 'vence7' ? 'ring-2 ring-orange-400 border-orange-300' : ''}`}
      >
        <p className="text-sm text-gray-500 flex items-center gap-1.5">
          <Clock size={14} className="text-orange-500" />
          Próximos 7 días
        </p>
        <p className="text-2xl font-semibold text-orange-600 mt-1">
          {formatCurrency(resumen.proximasAVencer?.monto || 0)}
        </p>
        <span className="text-xs text-gray-500">
          {resumen.proximasAVencer?.cantidad || 0} factura{resumen.proximasAVencer?.cantidad !== 1 ? 's' : ''} • Click para filtrar
        </span>
      </button>

      <div className="card">
        <p className="text-sm text-gray-500 flex items-center gap-1.5">
          <Users size={14} className="text-green-500" />
          Clientes con saldo
        </p>
        <p className="text-2xl font-semibold text-gray-900 mt-1">{resumen.totalClientes}</p>
      </div>
    </div>
  )
}
