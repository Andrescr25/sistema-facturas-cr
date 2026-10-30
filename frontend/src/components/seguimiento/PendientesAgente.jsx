import Insignia from '../ui/Insignia'
import { fechaEnPalabras } from '../../utils/fechaCR'

/** Lo que le falta HOY: clientes de sus rutas que le tocan y todavía no visitó (F5). */
export default function PendientesAgente({ pendientes }) {
  if (!pendientes) return null
  return (
    <section aria-label="Le falta hoy" className="space-y-3">
      <h2 className="text-lg font-bold text-neutro-900">Le falta hoy <span className="text-sm font-medium text-neutro-500">({pendientes.length})</span></h2>
      {pendientes.length === 0
        ? <div className="card p-6 text-center text-neutro-500">Visitó a todos los que le tocaban hoy.</div>
        : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pendientes.map(c => (
              <div key={c.id} className="card min-w-0 p-4">
                <p className="break-words font-bold text-neutro-900">{c.nombre}</p>
                <p className="mt-1 text-xs text-neutro-500">{c.ruta?.nombre}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Insignia tono={c.estado === 'atrasado' ? 'peligro' : 'alerta'}>{c.estado === 'atrasado' ? 'Atrasado' : 'Le toca hoy'}</Insignia>
                  <span className="text-sm text-neutro-600">{fechaEnPalabras(c.proximaVisita, { day: 'numeric', month: 'long' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
    </section>
  )
}
