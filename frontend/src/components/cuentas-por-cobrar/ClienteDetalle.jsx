import { useState } from 'react'
import { ArrowLeft, Users } from 'lucide-react'
import FacturaDeudaCard from './FacturaDeudaCard'
import ModalAbono from './ModalAbono'
import { formatCurrency } from '../../utils/cuentasPorCobrarUtils'

/**
 * Detalle de un cliente: header con total adeudado + lista de sus facturas
 * con saldo. De reporte-clientes/ClienteDetalle.jsx.
 */
export default function ClienteDetalle({ cliente, onVolver, onCargarAbonos, registrandoAbono, onRegistrarAbono }) {
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={onVolver} className="flex items-center text-gray-500 hover:text-blue-600 transition-colors">
          <ArrowLeft className="mr-2" size={20} /> Volver a clientes
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 rounded-xl bg-blue-100">
            <Users className="text-blue-600" size={32} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{cliente.clienteNombre}</h1>
          </div>
        </div>
        <div className="flex bg-gray-50 p-4 rounded-xl divide-x divide-gray-200">
          <div className="px-5 text-center">
            <p className="text-sm text-gray-500 font-medium">Facturas</p>
            <p className="text-2xl font-bold text-gray-900">{cliente.facturas.length}</p>
          </div>
          <div className="px-5 text-center">
            <p className="text-sm text-gray-500 font-medium">Saldo total</p>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(cliente.totalSaldo)}</p>
          </div>
        </div>
      </div>

      <FacturaDeudaCard facturas={cliente.facturas} onSeleccionarFactura={setFacturaSeleccionada} />

      {facturaSeleccionada && (
        <ModalAbono
          factura={facturaSeleccionada}
          clienteNombre={cliente.clienteNombre}
          procesando={registrandoAbono}
          onCargarAbonos={onCargarAbonos}
          onRegistrar={onRegistrarAbono}
          onCerrar={() => setFacturaSeleccionada(null)}
        />
      )}
    </div>
  )
}
