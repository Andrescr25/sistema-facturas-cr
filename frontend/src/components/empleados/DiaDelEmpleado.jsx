import { Footprints, RefreshCw, Users, Receipt, CalendarClock, MapPinOff, AlertTriangle, ListOrdered, Banknote, PencilLine, Timer } from 'lucide-react'
import Boton from '../ui/Boton'
import TarjetasResumen from '../pagos/TarjetasResumen'
import RecorridoAgente from '../seguimiento/RecorridoAgente'
import PendientesAgente from '../seguimiento/PendientesAgente'
import { useDiaDelEmpleado } from '../../hooks/useDiaDelEmpleado'
import { colones } from '../../utils/colones'
import { duracion } from '../../utils/ingresosTexto'
import { hoyEnCostaRica } from '../../utils/fechaCR'

/**
 * Su día (F5 del agente, 2026-10-29; dentro de Empleados desde el 2026-10-30:
 * «el seguimiento de agente, pónmelo dentro de empleados»). Lo que hizo un día:
 * su jornada, cuánto vendió, a quién visitó, quién no compró y por qué, dónde
 * estaba en cada acción y —si es hoy— qué le falta.
 */
export default function DiaDelEmpleado({ usuarioId }) {
  const s = useDiaDelEmpleado(usuarioId)
  const r = s.dia?.resumen
  const tarjetas = r ? [
    ...(r.jornada.tramos > 0 ? [{ clave: 'jornada', titulo: 'Jornada', icono: Timer, valor: duracion(r.jornada.minutos),
      tono: r.jornada.sinSalida ? 'alerta' : 'neutro', pie: r.jornada.abierta ? 'Trabajando ahora' : r.jornada.sinSalida ? 'Quedó sin salida' : undefined }] : []),
    { clave: 'visitados', titulo: 'Clientes atendidos', icono: Users, valor: r.clientesVisitados, tono: 'neutro',
      pie: r.pendientes !== null ? `Le faltan ${r.pendientes} de hoy` : undefined },
    { clave: 'ventas', titulo: 'Facturas', icono: Receipt, valor: r.ventas, tono: 'exito', pie: colones(r.monto) },
    { clave: 'sinventa', titulo: 'No compraron', icono: CalendarClock, valor: r.sinVenta, tono: 'alerta' },
    { clave: 'singps', titulo: 'Sin ubicación', icono: MapPinOff, valor: r.sinGps, tono: r.sinGps ? 'peligro' : 'neutro',
      pie: r.fueraDeVisita ? `${r.fueraDeVisita} factura${r.fueraDeVisita === 1 ? '' : 's'} fuera de Preventa` : undefined },
    ...(r.fichasCorregidas > 0 ? [{ clave: 'fichas', titulo: 'Fichas corregidas', icono: PencilLine, valor: r.fichasCorregidas, tono: 'neutro' }] : []),
    ...(r.cobrado > 0 ? [{ clave: 'cobrado', titulo: 'Cobró', icono: Banknote, valor: colones(r.cobrado), tono: 'exito' }] : [])
  ] : []

  return (
    <section aria-label="Su día" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-neutro-900"><Footprints size={18} className="text-primario-500" />Su día</h2>
        <div className="flex items-end gap-2">
          <label className="space-y-1 text-sm font-semibold text-neutro-700">
            <span className="block">Día</span>
            <input type="date" aria-label="Día" value={s.fecha} max={hoyEnCostaRica()} onChange={e => e.target.value && s.setFecha(e.target.value)} className="input" />
          </label>
          <Boton variante="secundario" icono={RefreshCw} cargando={s.cargando} onClick={s.recargar} aria-label="Actualizar el día" />
        </div>
      </div>
      {s.error && <p role="alert" className="rounded-xl bg-peligro-50 p-4 text-sm text-peligro-700">{s.error}</p>}
      {s.cargando && !s.dia && <p role="status" className="p-5 text-neutro-500">Consultando el día…</p>}
      {s.dia && (
        <>
          <TarjetasResumen compacta tarjetas={tarjetas} />
          {r.sinGps > 0 && (
            <p className="flex items-center gap-2 rounded-xl bg-alerta-50 p-3 text-sm font-semibold text-alerta-800">
              <AlertTriangle size={16} />Hay acciones sin ubicación: revisá si dio permiso de ubicación en su teléfono.
            </p>
          )}
          <h3 className="flex items-center gap-2 text-base font-bold text-neutro-900"><ListOrdered size={18} className="text-primario-500" />Recorrido del día</h3>
          <RecorridoAgente recorrido={s.dia.recorrido} />
          <PendientesAgente pendientes={s.dia.pendientes} />
        </>
      )}
    </section>
  )
}
