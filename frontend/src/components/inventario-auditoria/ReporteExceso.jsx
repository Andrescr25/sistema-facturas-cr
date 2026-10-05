import { PackageX, CalendarX2 } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/inventarioAuditoriaUtils'

/**
 * Reporte de solo lectura de un "Excesos N": productos con stock que no se
 * han vendido en los últimos 60 días, generado automáticamente. A
 * diferencia de una auditoría o devolución, acá no hay ningún ajuste que
 * aplicar en el inventario propio — es un listado para decidir qué liquidar.
 */
export default function ReporteExceso({ auditoriaActiva }) {
  const items = auditoriaActiva.items || []
  const valorTotal = items.reduce((sum, item) => sum + (Number(item.stock_sistema) * Number(item.costo_unitario || 0)), 0)

  return (
    <div className="space-y-6">
      <div className="bg-alerta-50 text-alerta-950 border border-alerta-200 p-5 rounded-3xl flex items-start gap-4">
        <PackageX className="text-alerta-600 shrink-0 mt-0.5" size={28} />
        <div className="space-y-1.5 text-sm">
          <h4 className="font-extrabold text-alerta-900 text-base">Reporte de Excesos</h4>
          <p>
            {items.length} producto(s) generados el <strong>{formatDate(auditoriaActiva.fecha_creacion)}</strong>, con un valor inmovilizado total de <strong>{formatCurrency(valorTotal)}</strong>.
          </p>
          <p className="text-xs text-alerta-700">
            Sin ventas registradas en los últimos 60 días al momento de generarse. Esto no modifica el inventario en el inventario propio — es solo un reporte para decidir qué liquidar (rebaja, promoción, devolución al proveedor).
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-neutro-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-neutro-100 bg-neutro-50/50">
          <h3 className="font-bold text-neutro-900">Productos ({items.length})</h3>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center text-neutro-400">
            <PackageX size={36} className="text-neutro-300 mx-auto mb-2" />
            <p className="font-bold text-neutro-700">Sin productos</p>
          </div>
        ) : (
          <div className="divide-y divide-neutro-100">
            {items.map(item => {
              const valor = Number(item.stock_sistema) * Number(item.costo_unitario || 0)
              return (
                <div key={item.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-neutro-900 text-sm truncate">{item.nombre_producto}</p>
                    <p className="text-xs text-neutro-400">
                      Ref: {item.referencia || 'N/A'} • {item.category || 'Sin categoría'} • Stock: <strong className="text-neutro-600">{Number(item.stock_sistema)}</strong> • Costo: {formatCurrency(item.costo_unitario)}
                    </p>
                    <p className="text-xs text-neutro-400 flex items-center gap-1 mt-0.5">
                      <CalendarX2 size={12} />
                      {item.ultima_venta
                        ? <>Última venta: <strong className="text-neutro-600">{formatDate(item.ultima_venta)}</strong></>
                        : 'Sin ventas registradas en los últimos 120 días'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block font-extrabold text-xs px-2.5 py-0.5 rounded-md uppercase bg-alerta-100 text-alerta-800">
                      {formatCurrency(valor)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
