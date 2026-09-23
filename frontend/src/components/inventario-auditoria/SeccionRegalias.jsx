import { Gift } from 'lucide-react'
import { formatDate } from '../../utils/inventarioAuditoriaUtils'

/**
 * Regalías: el historial de productos que llegaron a 100 % de descuento y se
 * le entregaron a un cliente elegido al azar, mientras existió la escalada
 * semanal automática (se quitó el 2026-09-20: hoy ningún descuento sube
 * solo). Sólo lectura — no hay acción posible desde acá.
 */
export default function SeccionRegalias({ regalos }) {
  if (!regalos || regalos.length === 0) return null

  return (
    <div className="bg-white rounded-3xl border border-neutro-100 shadow-sm overflow-hidden mt-6">
      <div className="p-6 border-b border-neutro-100 flex items-center gap-2 bg-nota-50/50">
        <Gift size={20} className="text-nota-600" />
        <h2 className="text-xl font-bold text-neutro-900">Regalías</h2>
      </div>

      <div className="px-6 py-3 bg-nota-50 border-b border-nota-100 text-xs text-nota-800">
        Productos que llegaron a 100% de descuento acumulado por no venderse — se entregaron gratis a un cliente elegido al azar entre los de ventas recientes.
      </div>

      <div className="divide-y divide-neutro-100">
        {regalos.map((regalo) => (
          <div key={regalo.id} className="p-4 sm:px-6 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-nota-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Gift size={16} className="text-nota-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-neutro-800">
                <span className="font-bold text-neutro-900">{regalo.nombre_producto}</span> llegó a 100% de descuento — se le entregó a{' '}
                <span className="font-bold text-nota-700">{regalo.cliente_nombre || 'Cliente no identificado'}</span>
              </p>
              <p className="text-xs text-neutro-400 mt-0.5">{formatDate(regalo.fecha_regalo)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
