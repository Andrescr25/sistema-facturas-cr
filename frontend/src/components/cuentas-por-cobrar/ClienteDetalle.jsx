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
  useEffect(() => { setElegidas(new Set()) }, [cliente.clienteId, cliente.clienteNombre])
  // Lo elegido que ya no está (se saldó) no se arrastra.
  const elegidasVigentes = new Set(cliente.facturas.filter((f) => elegidas.has(f.facturaId)).map((f) => f.facturaId))
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

  // La tabla compartida habla de {id, numero, saldo...}; acá se traduce la
  // factura como la manda el servidor de cobrar. Se guarda el original para
  // que el modal de abono siga recibiendo lo que espera.
  const filas = cliente.facturas.map((f) => ({
    id: f.facturaId,
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
      {cliente.facturas.length > 1 && (
        <BarraSeleccion
          cantidad={elegidasVigentes.size}
          total={cliente.facturas.filter((f) => elegidasVigentes.has(f.facturaId)).reduce((s, f) => s + Number(f.saldo || 0), 0)}
          totalFacturas={cliente.facturas.length}
          accion="Cobrar"
          onElegirTodas={() => setElegidas(new Set(cliente.facturas.map((f) => f.facturaId)))}
          onQuitar={() => setElegidas(new Set())}
          onAccion={() => setCobrandoVarias(true)}
        />
      )}
      <TablaFacturas
        facturas={filas}
        onSeleccionar={(f) => setFacturaSeleccionada(f.original)}
        seleccionadas={elegidasVigentes}
        onAlternar={cliente.facturas.length > 1 ? alternar : undefined}
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
              `/facturacion/facturas/${facturaAEnviar.facturaId}/whatsapp`, { telefono, mensaje })
            return data.data
          }}
          onCerrar={() => setFacturaAEnviar(null)}
        />
      )}

      {cobrandoVarias && elegidasVigentes.size > 0 && (
        <ModalPagoVarias
          sentido="entrada"
          titulo={cliente.clienteNombre}
          facturas={cliente.facturas
            .filter((f) => elegidasVigentes.has(f.facturaId))
            .map((f) => ({ id: f.facturaId, numero: f.numeroFactura, saldo: Number(f.saldo) }))}
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
          clienteNombre={cliente.clienteNombre}
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
