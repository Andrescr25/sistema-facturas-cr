import { CheckSquare, X } from 'lucide-react'
import { formatCurrency } from '../../utils/pagos'

/**
 * Lo que se va a cobrar o pagar junto: cuántas facturas, cuánto suman, y el
 * botón que abre el movimiento. Va arriba de la tabla de facturas de una
 * contraparte (Cuentas por Cobrar, Pagos a Proveedores).
 */
export default function BarraSeleccion({ cantidad, total, totalFacturas, accion, onElegirTodas, onQuitar, onAccion }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutro-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-sm text-neutro-600">
        {cantidad === 0
          ? 'Marcá las facturas que cubre un mismo pago para registrarlo de una vez.'
          : <>
              <strong className="text-neutro-900">{cantidad} factura{cantidad === 1 ? '' : 's'}</strong> elegida{cantidad === 1 ? '' : 's'} · saldo {formatCurrency(total)}
            </>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {cantidad < totalFacturas && (
          <button type="button" onClick={onElegirTodas} className="btn btn-outline inline-flex items-center gap-1.5 text-sm">
            <CheckSquare size={15} /> Elegir todas
          </button>
        )}
        {cantidad > 0 && (
          <>
            <button type="button" onClick={onQuitar} className="btn btn-outline inline-flex items-center gap-1.5 text-sm">
              <X size={15} /> Quitar
            </button>
            <button type="button" onClick={onAccion} className="btn btn-primary text-sm font-bold">
              {accion} {cantidad} factura{cantidad === 1 ? '' : 's'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
