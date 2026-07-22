import { Gift } from 'lucide-react'
import { formatDate } from '../../utils/inventarioAuditoriaUtils'

/**
 * Regalías: productos que subieron de descuento semana tras semana hasta
 * llegar a 100% (ver escalarDescuentosExceso en el backend) y fueron
 * entregados a un cliente elegido al azar entre los de ventas recientes.
 * Sólo lectura — no hay acción posible desde acá.
 */
export default function SeccionRegalias({ regalos }) {
  if (!regalos || regalos.length === 0) return null

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mt-6">
      <div className="p-6 border-b border-gray-100 flex items-center gap-2 bg-purple-50/50">
        <Gift size={20} className="text-purple-600" />
        <h2 className="text-xl font-bold text-gray-900">Regalías</h2>
      </div>

      <div className="px-6 py-3 bg-purple-50 border-b border-purple-100 text-xs text-purple-800">
        Productos que llegaron a 100% de descuento acumulado por no venderse — se entregaron gratis a un cliente elegido al azar entre los de ventas recientes.
      </div>

      <div className="divide-y divide-gray-100">
        {regalos.map((regalo) => (
          <div key={regalo.id} className="p-4 sm:px-6 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Gift size={16} className="text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-gray-800">
                <span className="font-bold text-gray-900">{regalo.nombre_producto}</span> llegó a 100% de descuento — se le entregó a{' '}
                <span className="font-bold text-purple-700">{regalo.cliente_nombre || 'Cliente no identificado'}</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(regalo.fecha_regalo)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
