import { ListChecks, CheckCircle2, CalendarClock } from 'lucide-react'
import Insignia from '../ui/Insignia'

const nombres = (lista) => lista.map(x => x.nombre).join(', ')

/**
 * Su plan del día en «Su día» (parte 4 de «Mi día», 2026-11-01): lo que el
 * agente planeó, en su orden, con qué pasó en cada uno y a qué hora (así se ve
 * si siguió el orden); a quién sacó del plan y a quién visitó fuera de él.
 */
export default function PlanDelDiaEmpleado({ plan }) {
  if (!plan) return <p className="card p-4 text-sm text-neutro-500">Ese día no armó su plan en «Mi día».</p>
  return (
    <section aria-label="Su plan del día" className="space-y-3">
      <h3 className="flex items-center gap-2 text-base font-bold text-neutro-900">
        <ListChecks size={18} className="text-primario-500" />Su plan del día
        <span className="text-sm font-medium text-neutro-500">({plan.visitados} de {plan.clientes.length} visitados)</span>
      </h3>
      <ol className="space-y-2">
        {plan.clientes.map(c => (
          <li key={c.id} className="card flex items-center gap-3 p-3">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${c.atendido ? 'bg-exito-100 text-exito-700' : 'bg-neutro-200 text-neutro-700'}`}>{c.numero}</span>
            <span className="min-w-0 flex-1">
              <span className="block break-words font-semibold text-neutro-900">{c.nombre}</span>
              {c.ruta && <span className="text-xs text-neutro-500">{c.ruta}</span>}
            </span>
            {!c.atendido ? <Insignia tono="alerta">Sin visitar</Insignia>
              : c.atendido.como === 'venta'
                ? <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-exito-700"><CheckCircle2 size={14} />Venta {c.atendido.hora}</span>
                : <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-nota-700"><CalendarClock size={14} />Próx. visita {c.atendido.hora}</span>}
          </li>
        ))}
      </ol>
      {plan.quitados.length > 0 && <p className="text-sm text-neutro-600"><b>Sacó de su plan:</b> {nombres(plan.quitados)}.</p>}
      {plan.fueraDelPlan.length > 0 && <p className="text-sm text-neutro-600"><b>Visitó fuera del plan:</b> {nombres(plan.fueraDelPlan)}.</p>}
    </section>
  )
}
