import { useState } from 'react'
import { Ban, CalendarClock, CheckCircle2, Loader2 } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/pagosProveedoresUtils'
import { cuandoSeCobra, fechaDeCobro } from '../../utils/chequeAFecha'
import { hoyEnCostaRica } from '../../utils/fechaCR'

/**
 * Un cheque a fecha sin confirmar (078): cuánto, para qué día y qué facturas
 * cubre. «Confirmar cobro» registra el pago con el día en que salió del banco
 * (por omisión el del cheque, o hoy si se cobró antes); «Anular», con motivo,
 * cuando no se va a cobrar. Lo usan la lista «Cheques por cobrar» y la factura.
 */
export default function FilaCheque({ cheque, procesando, mostrarProveedor = false, onConfirmar, onAnular }) {
  const hoy = hoyEnCostaRica()
  const [accion, setAccion] = useState(null) // 'confirmar' | 'anular'
  const [fecha, setFecha] = useState(() => fechaDeCobro(cheque, hoy))
  const [motivo, setMotivo] = useState('')
  const cuando = cuandoSeCobra(cheque, hoy)

  const confirmar = async () => { if (await onConfirmar(cheque, fecha)) setAccion(null) }
  const anular = async () => { if (motivo.trim() && await onAnular(cheque, motivo.trim())) setAccion(null) }

  return (
    <div className={`rounded-xl border p-4 ${cuando.porConfirmar ? 'border-alerta-200 bg-alerta-50/60' : 'border-neutro-100 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {mostrarProveedor && <p className="text-sm font-semibold text-neutro-500">{cheque.proveedorNombre}</p>}
          <p className="text-base font-bold text-neutro-900">Cheque #{cheque.numero} · para el {formatDate(cheque.fechaCobro)}</p>
          <p className={`mt-0.5 flex items-center gap-1.5 text-sm ${cuando.porConfirmar ? 'font-semibold text-alerta-800' : 'text-neutro-500'}`}>
            <CalendarClock size={15} className="shrink-0" /> {cuando.texto}
          </p>
          <p className="mt-0.5 text-xs text-neutro-500">
            {cheque.facturas.length === 1 ? 'Factura' : 'Facturas'} {cheque.facturas.map((f) => `#${f.numero}`).join(', ')}
          </p>
        </div>
        <p className="shrink-0 text-xl font-extrabold text-neutro-900">{formatCurrency(cheque.monto)}</p>
      </div>

      {!accion && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setAccion('confirmar')} disabled={procesando}
            className="btn btn-primary inline-flex min-h-11 items-center gap-1.5">
            <CheckCircle2 size={16} /> Confirmar cobro
          </button>
          <button type="button" onClick={() => { setAccion('anular'); setMotivo('') }} disabled={procesando}
            className="btn btn-outline inline-flex min-h-11 items-center gap-1.5">
            <Ban size={16} /> Anular
          </button>
        </div>
      )}

      {accion === 'confirmar' && (
        <div className="mt-3 space-y-2 rounded-xl bg-neutro-50 p-3">
          <label className="block text-sm font-semibold text-neutro-700">¿Qué día salió del banco?</label>
          <input type="date" value={fecha} max={hoy} min={cheque.fechaEmision} onChange={(e) => setFecha(e.target.value)}
            className="input h-12 w-full text-base" />
          <p className="text-xs text-neutro-500">Se registra el pago: baja la deuda y sale de Caja General ese día.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={confirmar} disabled={procesando || !fecha || fecha > hoy}
              className="btn inline-flex min-h-11 items-center gap-1.5 bg-exito-600 text-white hover:bg-exito-700 disabled:opacity-40">
              {procesando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Confirmar {formatCurrency(cheque.monto)}
            </button>
            <button type="button" onClick={() => setAccion(null)} className="btn btn-outline min-h-11">Cancelar</button>
          </div>
        </div>
      )}

      {accion === 'anular' && (
        <div className="mt-3 space-y-2">
          <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} autoFocus
            placeholder="¿Por qué se anula el cheque?" className="input h-11 w-full text-base" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={anular} disabled={procesando || !motivo.trim()}
              className="btn inline-flex min-h-11 items-center gap-1.5 bg-peligro-600 text-white hover:bg-peligro-700 disabled:opacity-40">
              {procesando ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
              Anular cheque
            </button>
            <button type="button" onClick={() => setAccion(null)} className="btn btn-outline min-h-11">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
