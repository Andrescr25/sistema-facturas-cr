import { useState } from 'react'
import { ArrowLeft, Users } from 'lucide-react'
import FacturaDeudaCard from './FacturaDeudaCard'
import ModalAbono from './ModalAbono'
import ModalEnviarWhatsApp from '../whatsapp/ModalEnviarWhatsApp'
import { mensajeFactura } from '../../utils/mensajesWhatsApp'
import api from '../../services/api'
import { formatCurrency } from '../../utils/cuentasPorCobrarUtils'

/**
 * Detalle de un cliente: header con total adeudado + lista de sus facturas
 * con saldo. De reporte-clientes/ClienteDetalle.jsx.
 */
export default function ClienteDetalle({ cliente, onVolver, onCargarAbonos, registrandoAbono, onRegistrarAbono }) {
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  // Recordatorio de saldo: el texto lo propone el servidor con los saldos de
  // este momento, no el navegador — que puede tener la lista abierta desde
  // antes de un abono y mandarle al cliente una cifra que ya no debe.
  const [recordatorio, setRecordatorio] = useState(null)
  // La factura que se está por mandar por WhatsApp, con su PDF.
  const [facturaAEnviar, setFacturaAEnviar] = useState(null)

  const abrirRecordatorio = async () => {
    const { data } = await api.get(`/cuentas-por-cobrar/clientes/${cliente.clienteId}/recordatorio`)
    setRecordatorio(data.data)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={onVolver} className="flex items-center text-neutro-500 hover:text-primario-600 transition-colors">
          <ArrowLeft className="mr-2" size={20} /> Volver a clientes
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutro-100 p-6 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 rounded-xl bg-primario-100">
            <Users className="text-primario-600" size={32} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-neutro-900">{cliente.clienteNombre}</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={abrirRecordatorio}
          className="self-start md:self-auto bg-exito-600 hover:bg-exito-700 text-white text-sm font-bold py-2.5 px-4 rounded-xl transition-colors"
        >
          Recordar saldo por WhatsApp
        </button>
        <div className="flex bg-neutro-50 p-4 rounded-xl divide-x divide-neutro-200">
          <div className="px-5 text-center">
            <p className="text-sm text-neutro-500 font-medium">Facturas</p>
            <p className="text-2xl font-bold text-neutro-900">{cliente.facturas.length}</p>
          </div>
          <div className="px-5 text-center">
            <p className="text-sm text-neutro-500 font-medium">Saldo total</p>
            <p className="text-2xl font-bold text-primario-600">{formatCurrency(cliente.totalSaldo)}</p>
          </div>
        </div>
      </div>

      <FacturaDeudaCard
        facturas={cliente.facturas}
        onSeleccionarFactura={setFacturaSeleccionada}
        onEnviarWhatsApp={setFacturaAEnviar}
      />

      {recordatorio && (
        <ModalEnviarWhatsApp
          titulo={`Recordarle el saldo a ${recordatorio.cliente}`}
          subtitulo={`Debe ${formatCurrency(recordatorio.totalSaldo)}`}
          contactoId={cliente.clienteId}
          documento={{ tipo: 'saldo', referencia: String(cliente.clienteId) }}
          mensajeInicial={recordatorio.mensaje}
          onEnviar={async ({ telefono, mensaje }) => {
            const { data } = await api.post(
              `/cuentas-por-cobrar/clientes/${cliente.clienteId}/recordatorio`, { telefono, mensaje })
            return data.data
          }}
          onCerrar={() => setRecordatorio(null)}
        />
      )}

      {facturaAEnviar && (
        <ModalEnviarWhatsApp
          titulo={`Mandar la factura ${facturaAEnviar.numeroFactura}`}
          subtitulo={`Va con el PDF adjunto, a ${cliente.clienteNombre}`}
          contactoId={cliente.clienteId}
          documento={{ tipo: 'factura', referencia: facturaAEnviar.numeroFactura }}
          mensajeInicial={mensajeFactura({
            numero: facturaAEnviar.numeroFactura,
            cliente: cliente.clienteNombre
          })}
          onEnviar={async ({ telefono, mensaje }) => {
            const { data } = await api.post(
              `/alegra/facturacion/invoices/${facturaAEnviar.alegraInvoiceId}/whatsapp`, { telefono, mensaje })
            return data.data
          }}
          onCerrar={() => setFacturaAEnviar(null)}
        />
      )}

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
