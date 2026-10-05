import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import DetalleContraparte from '../pagos/DetalleContraparte'
import TablaFacturas from '../pagos/TablaFacturas'
import ModalAbono from './ModalAbono'
import ModalPagoVarias from '../pagos/ModalPagoVarias'
import BarraSeleccion from '../pagos/BarraSeleccion'
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
export default function ClienteDetalle({ cliente, onVolver, onCargarAbonos, onCargarProductos, registrandoAbono, onRegistrarAbono, onRegistrarCobroVarias }) {
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  // Varias facturas en un solo cobro ("este pago cubre A, B y C"): un solo
  // movimiento que entra a Caja General. Al cambiar de cliente se suelta.
  const [elegidas, setElegidas] = useState(new Set())
  const [cobrandoVarias, setCobrandoVarias] = useState(false)
  useEffect(() => { setElegidas(new Set()) }, [cliente.clienteId, cliente.nombre])
  // Lo elegido que ya no está (se saldó) no se arrastra.
  const elegidasVigentes = new Set(cliente.detalle.filter((f) => elegidas.has(f.id)).map((f) => f.id))
  const alternar = (f) => setElegidas((prev) => {
    const nuevo = new Set(prev)
    if (nuevo.has(f.id)) nuevo.delete(f.id); else nuevo.add(f.id)
    return nuevo
  })
  // Recordatorio de saldo: el texto lo propone el servidor con los saldos de
  // este momento, no el navegador — que puede tener la lista abierta desde
  // antes de un abono y mandarle al cliente una cifra que ya no debe.
  const [recordatorio, setRecordatorio] = useState(null)
  // La factura que se está por mandar por WhatsApp, con su PDF.
  const [facturaAEnviar, setFacturaAEnviar] = useState(null)

  const abrirRecordatorio = async () => {
    const { data } = await api.get(`/cuentas-por-cobrar/propios/clientes/${cliente.clienteId}/recordatorio`)
    setRecordatorio(data.data)
  }

  // La tabla compartida pide {id, numero, saldo…}, que es como ya viene la
  // factura. Se guarda el original para el modal de abono.
  const filas = cliente.detalle.map((f) => ({
    id: f.id,
    numero: f.numero,
    fechaVencimiento: f.fechaVencimiento,
    diasRestantes: f.diasRestantes,
    estado: f.estado,
    saldo: f.saldo,
    original: f
  }))

  return (
    <DetalleContraparte
      nombre={cliente.nombre}
      icono={Users}
      cantidadFacturas={cliente.detalle.length}
      totalSaldo={cliente.saldoTotal}
      textoVolver="Volver a clientes"
      onVolver={onVolver}
      acciones={
        <button
          type="button"
          onClick={abrirRecordatorio}
          disabled={!cliente.clienteId}
          title={cliente.clienteId
            ? 'Mandarle el detalle de su saldo por WhatsApp'
            : 'Estas facturas no tienen ficha de cliente: se borró en Alegra antes de la copia. Hay que reasignarlas para poder escribirle.'}
          className="self-start md:self-auto bg-exito-600 hover:bg-exito-700 disabled:bg-neutro-300 disabled:cursor-not-allowed text-white text-sm font-bold py-2.5 px-4 rounded-xl transition-colors whitespace-nowrap"
        >
          Recordar saldo por WhatsApp
        </button>
      }
    >
      {cliente.detalle.length > 1 && (
        <BarraSeleccion
          cantidad={elegidasVigentes.size}
          total={cliente.detalle.filter((f) => elegidasVigentes.has(f.id)).reduce((s, f) => s + Number(f.saldo || 0), 0)}
          totalFacturas={cliente.detalle.length}
          accion="Cobrar"
          onElegirTodas={() => setElegidas(new Set(cliente.detalle.map((f) => f.id)))}
          onQuitar={() => setElegidas(new Set())}
          onAccion={() => setCobrandoVarias(true)}
        />
      )}
      <TablaFacturas
        facturas={filas}
        onSeleccionar={(f) => setFacturaSeleccionada(f.original)}
        seleccionadas={elegidasVigentes}
        onAlternar={cliente.detalle.length > 1 ? alternar : undefined}
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

      {/* Los teléfonos vienen CON el recordatorio: antes el modal iba a
          buscarlos a la ficha de Alegra por su contactoId. */}
      {recordatorio && (
        <ModalEnviarWhatsApp
          titulo={`Recordarle el saldo a ${recordatorio.cliente}`}
          subtitulo={`Debe ${formatCurrency(recordatorio.saldoTotal)}`}
          telefonos={recordatorio.candidatos}
          telefonosSinReconocer={recordatorio.sinReconocer}
          documento={{ tipo: 'saldo', referencia: String(cliente.clienteId) }}
          mensajeInicial={recordatorio.mensaje}
          onEnviar={async ({ telefono, mensaje }) => {
            const { data } = await api.post(
              `/cuentas-por-cobrar/propios/clientes/${cliente.clienteId}/recordatorio`, { telefono, mensaje })
            return data.data
          }}
          onCerrar={() => setRecordatorio(null)}
        />
      )}

      {facturaAEnviar && (
        <ModalEnviarWhatsApp
          titulo={`Mandar la factura ${facturaAEnviar.numero}`}
          subtitulo={`Va con el PDF adjunto, a ${cliente.nombre}`}
          clienteId={cliente.clienteId}
          documento={{ tipo: 'factura', referencia: facturaAEnviar.numero }}
          mensajeInicial={mensajeFactura({
            numero: facturaAEnviar.numero,
            cliente: cliente.nombre
          })}
          onEnviar={async ({ telefono, mensaje }) => {
            const { data } = await api.post(
              `/facturacion/facturas/${facturaAEnviar.id}/whatsapp`, { telefono, mensaje })
            return data.data
          }}
          onCerrar={() => setFacturaAEnviar(null)}
        />
      )}

      {cobrandoVarias && elegidasVigentes.size > 0 && (
        <ModalPagoVarias
          sentido="entrada"
          titulo={cliente.nombre}
          facturas={cliente.detalle
            .filter((f) => elegidasVigentes.has(f.id))
            .map((f) => ({ id: f.id, numero: f.numero, saldo: Number(f.saldo) }))}
          procesando={registrandoAbono}
          onRegistrar={async (datos) => {
            const ok = await onRegistrarCobroVarias(datos)
            if (ok) setElegidas(new Set())
            return ok
          }}
          onCerrar={() => setCobrandoVarias(false)}
        />
      )}

      {facturaSeleccionada && (
        <ModalAbono
          factura={facturaSeleccionada}
          clienteNombre={cliente.nombre}
          procesando={registrandoAbono}
          onCargarAbonos={onCargarAbonos}
          onCargarProductos={onCargarProductos}
          onRegistrar={onRegistrarAbono}
          onCerrar={() => setFacturaSeleccionada(null)}
        />
      )}
    </DetalleContraparte>
  )
}
