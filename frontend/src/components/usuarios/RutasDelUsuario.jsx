import { Loader2 } from 'lucide-react'
import Casilla from './Casilla'
import { useRutasParaAsignar } from '../../hooks/useRutasParaAsignar'

/**
 * Las rutas que atiende un usuario de Preventa sin «Ver todas las rutas»
 * (2026-10-29, el agente de ventas). Preventa le muestra solo estas; el
 * servidor lo hace valer. Cada cambio queda en la bitácora.
 */
export default function RutasDelUsuario({ seleccionadas, onCambiar, deshabilitado }) {
  const { rutas, cargando, error } = useRutasParaAsignar(true)
  const alternar = (id) => onCambiar(seleccionadas.includes(id) ? seleccionadas.filter(r => r !== id) : [...seleccionadas, id])

  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-neutro-400">Rutas que atiende</p>
      <div className="overflow-hidden rounded-2xl border border-neutro-200">
        {cargando && <p className="flex items-center gap-2 px-3 py-2 text-sm text-neutro-500"><Loader2 size={14} className="animate-spin" />Consultando rutas…</p>}
        {error && <p className="px-3 py-2 text-sm text-peligro-700">{error}</p>}
        {!cargando && !error && rutas.length === 0 && <p className="px-3 py-2 text-sm text-neutro-500">Todavía no hay rutas creadas.</p>}
        <div className="divide-y divide-neutro-100">
          {rutas.map(r => (
            <Casilla key={r.id} marcado={seleccionadas.includes(r.id)} nombre={`${r.nombre}${r.activo ? '' : ' (inactiva)'}`}
              onClick={() => alternar(r.id)} deshabilitado={deshabilitado} />
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-neutro-500">
        En Preventa verá solo estas rutas. Para que vea todas, marque «Ver todas las rutas» debajo de Preventa.
      </p>
    </div>
  )
}
