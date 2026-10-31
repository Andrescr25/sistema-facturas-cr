import { Wallet } from 'lucide-react'
import { colones } from '../../utils/colones'

/**
 * «El total que le debo» (el usuario, 2026-10-30): lo que falta de cada
 * quincena terminada y la gasolina sin pagar de la que corre. Lo mismo para
 * el empleado (lo que le deben) y para Empleados.
 */
export default function DeudaEmpleado({ deuda, titulo }) {
  const conSaldo = deuda.quincenas.filter(q => q.debe !== 0)
  return (
    <section aria-label={titulo} className={`card p-5 ${deuda.total > 0 ? 'border-2 border-alerta-200 bg-alerta-50' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-neutro-800"><Wallet size={18} className="text-alerta-600" />{titulo}</p>
        <p className={`text-2xl font-bold ${deuda.total > 0 ? 'text-alerta-800' : 'text-neutro-700'}`}>{colones(deuda.total)}</p>
      </div>
      {conSaldo.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm">
          {conSaldo.map(q => (
            <li key={q.clave} className="flex justify-between gap-3 text-neutro-700">
              <span>{q.nombre}{q.enCurso && !q.pagada ? ' (gasolina sin pagar)' : ''}</span>
              <span className="font-semibold">{q.debe < 0 ? `pagado de más ${colones(-q.debe)}` : colones(q.debe)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-1 text-sm text-neutro-500">Al día: no hay nada pendiente de pago.</p>}
    </section>
  )
}
