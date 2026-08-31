import { ChevronRight } from 'lucide-react'
import { formatCurrency, formatDate, diasLabel, ESTADO_FACTURA_ESTILO } from '../../utils/cuentasPorCobrarUtils'

/**
 * Lista de facturas con saldo de un cliente: tarjetas en móvil, tabla en
 * desktop (mismo patrón que inventario-auditoria/HistorialDevoluciones.jsx).
 * Cada fila/tarjeta abre el modal de abono de esa factura.
 */
export default function FacturaDeudaCard({ facturas, onSeleccionarFactura }) {
  if (facturas.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutro-100 text-center py-12">
        <p className="text-neutro-500">Este cliente no tiene facturas con saldo.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutro-100 overflow-hidden">
      {/* Mobile Card List */}
      <div className="block sm:hidden divide-y divide-neutro-100">
        {facturas.map((factura) => {
          const estilo = ESTADO_FACTURA_ESTILO[factura.estado] || ESTADO_FACTURA_ESTILO.PENDIENTE
          return (
            <div
              key={factura.alegraInvoiceId}
              onClick={() => onSeleccionarFactura(factura)}
              className={`p-4 active:bg-neutro-50 cursor-pointer flex flex-col gap-2 border-l-4 ${estilo.borde}`}
            >
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <h4 className="font-bold text-neutro-900 truncate">Factura #{factura.numeroFactura}</h4>
                  <p className="text-xs text-neutro-400">{formatDate(factura.fechaVencimiento)} • {diasLabel(factura.diasRestantes)}</p>
                </div>
                <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0 ${estilo.badge}`}>
                  {factura.estado}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-neutro-500">Saldo</span>
                <strong className="text-lg text-neutro-900">{formatCurrency(factura.saldo)}</strong>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-neutro-50 text-xs font-bold text-neutro-400 uppercase tracking-wider border-b border-neutro-100">
              <th className="px-6 py-4">Factura</th>
              <th className="px-6 py-4">Vencimiento</th>
              <th className="px-6 py-4">Estado</th>
              <th className="px-6 py-4 text-right">Saldo</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutro-100 text-sm">
            {facturas.map((factura) => {
              const estilo = ESTADO_FACTURA_ESTILO[factura.estado] || ESTADO_FACTURA_ESTILO.PENDIENTE
              return (
                <tr
                  key={factura.alegraInvoiceId}
                  onClick={() => onSeleccionarFactura(factura)}
                  className="hover:bg-neutro-50/70 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <p className="font-bold text-neutro-900 group-hover:text-primario-700 transition-colors">#{factura.numeroFactura}</p>
                  </td>
                  <td className="px-6 py-4 text-neutro-500">
                    {formatDate(factura.fechaVencimiento)}
                    <span className={`block text-xs mt-0.5 ${factura.diasRestantes < 0 ? 'text-peligro-600' : factura.diasRestantes <= 7 ? 'text-alerta-600' : 'text-neutro-400'}`}>
                      {diasLabel(factura.diasRestantes)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center font-bold text-xs px-3 py-1 rounded-full uppercase tracking-wider ${estilo.badge}`}>
                      {factura.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-extrabold text-neutro-900">
                    {formatCurrency(factura.saldo)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ChevronRight className="text-neutro-400 group-hover:text-primario-600 transition-colors inline-block" size={20} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
