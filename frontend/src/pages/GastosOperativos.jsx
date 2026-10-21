import { useGastosOperativos } from '../hooks/useGastosOperativos'
import ListaGastos from '../components/gastos-operativos/ListaGastos'
import DetalleGasto from '../components/gastos-operativos/DetalleGasto'
import ModalPagoVarias from '../components/pagos/ModalPagoVarias'
import ConfirmModal from '../components/ConfirmModal'

export default function GastosOperativos() {
  const e = useGastosOperativos()
  return (
    <>
      {e.error && <p role="alert" className="mx-auto mb-4 max-w-5xl rounded-xl bg-peligro-50 p-4 text-sm text-peligro-700">{e.error}</p>}
      {e.aviso && <p role="status" className="mx-auto mb-4 max-w-5xl rounded-xl bg-exito-50 p-4 text-sm text-exito-700">{e.aviso}</p>}
      {e.id ? <DetalleGasto estado={e} /> : <ListaGastos estado={e} />}
      {e.modalPago && e.detalle && <ModalPagoVarias sentido="salida" titulo={`Pagar a ${e.detalle.proveedor_nombre}`} facturas={[{ id: e.detalle.cuenta_id, numero: e.detalle.numero_consecutivo, saldo: Number(e.detalle.saldo) }]} procesando={e.ocupado === 'pagar'} onRegistrar={e.pagar} onCerrar={() => e.setModalPago(false)} />}
      <ConfirmModal {...e.dialogProps} />
    </>
  )
}
