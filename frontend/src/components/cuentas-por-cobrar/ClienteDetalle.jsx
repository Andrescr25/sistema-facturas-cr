import { useState } from 'react'
import { Users } from 'lucide-react'
import DetalleContraparte from '../pagos/DetalleContraparte'
import TablaFacturas from '../pagos/TablaFacturas'
import ModalAbono from './ModalAbono'
import ModalEnviarWhatsApp from '../whatsapp/ModalEnviarWhatsApp'
import { mensajeFactura } from '../../utils/mensajesWhatsApp'
import api from '../../services/api'
import { formatCurrency } from '../../utils/pagos'

/**
 * Un cliente y sus facturas con saldo.
 *
 * La cabecera y la tabla son las compartidas con Pagos a Proveedores (ver
 * components/pagos/): lo único propio de acá es cobrar —el modal de abono— y
 * los dos envíos por WhatsApp.
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

  // La tabla compartida habla de {id, numero, saldo...}; acá se traduce la
  // factura como la manda el servidor de cobrar. Se guarda el original para
  // que el modal de abono siga recibiendo lo que espera.
  const filas = cliente.facturas.map((f) => ({
    id: f.alegraInvoiceId,
    numero: f.numeroFactura,
    fechaVencimiento: f.fechaVencimiento,
    diasRestantes: f.diasRestantes,
    estado: f.estado,
    saldo: f.saldo,
    original: f
  }))

  return (
    <DetalleContraparte
      nombre={cliente.clienteNombre}
      icono={Users}
      cantidadFacturas={cliente.facturas.length}
      totalSaldo={cliente.totalSaldo}
      textoVolver="Volver a clientes"
      onVolver={onVolver}
      acciones={
        <button
          type="button"
          onClick={abrirRecordatorio}
          className="self-start md:self-auto bg-exito-600 hover:bg-exito-700 text-white text-sm font-bold py-2.5 px-4 rounded-xl transition-colors whitespace-nowrap"
        >
          Recordar saldo por WhatsApp
        </button>
      }
    >
      <TablaFacturas
        facturas={filas}
        onSeleccionar={(f) => setFacturaSeleccionada(f.original)}
        vacio="Este cliente no tiene facturas con saldo."
        accion={(f) => (
          <button
            type="button"
            onClick={() => setFacturaAEnviar(f.original)}
            className="text-xs font-bold text-exito-700 hover:text-exito-800 border-2 border-neutro-200 hover:border-exito-400 rounded-lg px-2.5 py-1 transition-colors"
          >
            WhatsApp
          </button>
        )}
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
    </DetalleContraparte>
  )
}
