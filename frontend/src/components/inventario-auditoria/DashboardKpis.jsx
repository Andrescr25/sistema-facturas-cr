import { TrendingUp, DollarSign, Boxes } from 'lucide-react'
import { formatCurrency, tamanoTextoMonto } from '../../utils/inventarioAuditoriaUtils'

/**
 * Las 3 tarjetas de KPIs del dashboard de auditorías: precisión, descuadre
 * acumulado, y total de auditorías realizadas. Extraído de
 * InventarioAuditoria.jsx.
 */
export default function DashboardKpis({ kpis }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* KPI 1 */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
        <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-600">
          <TrendingUp size={28} />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Precisión de Inventario</p>
          <h3 className="text-3xl font-extrabold text-gray-900 mt-1">
            {kpis.precision.toFixed(1)}%
          </h3>
        </div>
      </div>

      {/* KPI 2 */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
        <div className={`p-4 rounded-2xl ${kpis.descuadre >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
          <DollarSign size={28} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Descuadre Acumulado</p>
          <h3 className={`font-extrabold mt-1 break-words ${tamanoTextoMonto(formatCurrency(kpis.descuadre))} ${kpis.descuadre >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {formatCurrency(kpis.descuadre)}
          </h3>
        </div>
      </div>

      {/* KPI 3 */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
        <div className="p-4 bg-gray-50 rounded-2xl text-gray-600">
          <Boxes size={28} />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Auditorías Realizadas</p>
          <h3 className="text-3xl font-extrabold text-gray-900 mt-1">
            {kpis.total}
          </h3>
        </div>
      </div>
    </div>
  )
}
