import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { useAprobacionGastoForm } from '../../hooks/useAprobacionGastoForm'
import { categoriaGasto } from '../../utils/gastosOperativos'
import { fechaCorta } from '../../utils/fechaCR'
import { formatearMoneda } from '../../utils/moneda'

export default function ModalAprobarGasto({ estado: e }) {
  const f = useAprobacionGastoForm()
  const { gasto: g, accion } = e.seleccion
  const aprobar = accion === 'aprobar'
  const listo = !aprobar || (f.metodo && g.validacion === 'validado' && g.moneda === 'CRC')
  return (
    <Modal titulo={aprobar ? 'Aprobar gasto' : 'Rechazar gasto'} ancho="lg" onCerrar={e.cerrar} pie={<div className="flex justify-end gap-2"><Boton variante="secundario" disabled={e.ocupado} onClick={e.cerrar}>Cancelar</Boton><Boton variante={aprobar ? 'primario' : 'peligro'} disabled={!listo} cargando={e.ocupado} onClick={() => e.confirmar(f.datos)}>{aprobar ? 'Aprobar y registrar pago' : 'Confirmar rechazo'}</Boton></div>}>
      <div className="space-y-4 p-5">
        <div><p className="break-words text-lg font-bold text-neutro-900">{g.proveedor_nombre}</p><p className="mt-1 text-sm text-neutro-500">{categoriaGasto(g.categoria)} · {fechaCorta(g.fecha_emision)}</p><p className="mt-1 break-all text-xs text-neutro-400">Factura {g.numero_consecutivo}</p></div>
        <p className="text-3xl font-extrabold text-neutro-900">{formatearMoneda(g.total_factura, g.moneda)}</p>
        {aprobar ? <>
          <label className="block text-sm font-semibold text-neutro-700">¿Con qué medio se pagó?<select aria-label="Medio de pago del gasto" className="input mt-2 h-12 w-full" value={f.metodoPagoId} onChange={ev => f.setMetodoPagoId(ev.target.value)} disabled={e.ocupado}><option value="">Elegí el medio de pago…</option>{f.metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>
          <p className="rounded-xl bg-neutro-50 p-3 text-sm text-neutro-600">Se registra el pago completo en Caja General con fecha {fechaCorta(g.fecha_emision)} y se envía la aceptación a Hacienda.</p>
          {Number(g.pagado) > 0 && <p className="text-sm text-nota-700">Ya hay pagos por {formatearMoneda(g.pagado, g.moneda)}. Sólo se registrará el saldo restante.</p>}
          {g.validacion !== 'validado' && <p role="alert" className="text-sm text-alerta-700">{g.motivo_validacion || 'El XML requiere revisión antes de aprobar.'}</p>}
          {g.moneda !== 'CRC' && <p role="alert" className="text-sm text-alerta-700">Este comprobante necesita conversión a colones antes de registrar el pago.</p>}
          {f.error && <p role="alert" className="text-sm text-peligro-700">{f.error}</p>}
        </> : <>
          <p className="text-sm text-neutro-600">Se rechazará el comprobante sin registrar un pago.</p>
          <label className="block text-sm font-semibold text-neutro-700">Motivo del rechazo (opcional)<textarea aria-label="Motivo del rechazo del gasto" className="input mt-2 w-full" rows={2} maxLength={160} value={f.motivo} onChange={ev => f.setMotivo(ev.target.value)} disabled={e.ocupado} /></label>
        </>}
        {e.error && <p role="alert" className="text-sm text-peligro-700">{e.error}</p>}
      </div>
    </Modal>
  )
}
