import { useState } from 'react'
import { ChevronDown, ChevronRight, FileClock } from 'lucide-react'
import FilaCheque from './FilaCheque'
import { formatCurrency } from '../../utils/pagosProveedoresUtils'
import { hoyEnCostaRica } from '../../utils/fechaCR'

/**
 * Los cheques a fecha que todavía no se confirmaron (078), del más próximo al
 * más lejano. Las facturas que cubren se siguen debiendo hasta confirmar.
 * Se abre sola si alguno ya llegó a su fecha: es trabajo pendiente.
 */
export default function ChequesPorCobrar({ cheques, procesandoId, onConfirmar, onAnular }) {
  const hoy = hoyEnCostaRica()
  const porConfirmar = cheques.filter((c) => c.fechaCobro <= hoy).length
  const [abierto, setAbierto] = useState(porConfirmar > 0)

  if (cheques.length === 0) return null
  const total = cheques.reduce((s, c) => s + c.monto, 0)

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${porConfirmar ? 'border-alerta-300' : 'border-primario-200'}`}>
      <button type="button" onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 transition hover:bg-primario-50/40">
        <div className="flex min-w-0 items-center gap-2.5">
          {abierto ? <ChevronDown size={18} className="shrink-0 text-neutro-400" /> : <ChevronRight size={18} className="shrink-0 text-neutro-400" />}
          <FileClock size={20} className="shrink-0 text-primario-600" />
          <div className="min-w-0 text-left">
            <h3 className="font-bold text-neutro-900">Cheques por cobrar ({cheques.length})</h3>
            <p className="text-xs text-neutro-500">
              {porConfirmar
                ? <span className="font-semibold text-alerta-800">{porConfirmar === 1 ? 'Uno ya llegó a su fecha' : `${porConfirmar} ya llegaron a su fecha`}: confirmá si se cobraron</span>
                : 'Cheques a fecha: sus facturas se siguen debiendo hasta confirmar el cobro'}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xl font-bold text-neutro-900">{formatCurrency(total)}</span>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-neutro-100 p-4">
          {cheques.map((c) => (
            <FilaCheque key={c.id} cheque={c} mostrarProveedor procesando={procesandoId === `cheque-${c.id}`}
              onConfirmar={onConfirmar} onAnular={onAnular} />
          ))}
        </div>
      )}
    </div>
  )
}
