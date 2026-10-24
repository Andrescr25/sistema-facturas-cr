import { Clock } from 'lucide-react'
import { formatCurrency, formatDate, diasLabel } from '../../utils/pagos'

/**
 * Lo primero que se mira al abrir una factura: cuánto falta y para cuándo.
 *
 * El saldo va grande y centrado porque es la única cifra que se busca
 * siempre; la fecha va debajo con el color de su urgencia, que es lo que
 * decide si esto se atiende hoy o la semana entrante.
 */
export default function ResumenSaldo({ saldo, etiqueta = 'Saldo pendiente', fechaVencimiento, diasRestantes }) {
  const dias = Number(diasRestantes)
  const tono = dias < 0
    ? { texto: 'text-peligro-600', fondo: 'bg-peligro-50 border-peligro-100' }
    : dias <= 7
      ? { texto: 'text-alerta-600', fondo: 'bg-alerta-50 border-alerta-100' }
      : { texto: 'text-neutro-500', fondo: 'bg-neutro-50 border-neutro-100' }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-primario-100 bg-primario-50 p-4 text-center">
        <p className="mb-1 text-sm font-medium text-primario-600">{etiqueta}</p>
        <p className="text-2xl font-extrabold text-primario-900 sm:text-3xl">{formatCurrency(saldo)}</p>
      </div>

      {fechaVencimiento && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${tono.fondo}`}>
          {/* shrink-0: sin él el ícono se achicaba cuando el texto apretaba. */}
          <Clock size={18} className={`shrink-0 ${tono.texto}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutro-800">Vence: <span className="whitespace-nowrap">{formatDate(fechaVencimiento)}</span></p>
            <p className={`text-xs font-medium ${tono.texto}`}>{diasLabel(dias)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
