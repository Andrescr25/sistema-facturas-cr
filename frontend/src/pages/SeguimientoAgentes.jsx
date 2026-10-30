import { Footprints as IconoRecorrido, RefreshCw, Users, Receipt, CalendarClock, MapPinOff, AlertTriangle, ListOrdered, Banknote, PencilLine } from 'lucide-react'
import { useSeguimientoAgente } from '../hooks/useSeguimientoAgente'
import Boton from '../components/ui/Boton'
import TarjetasResumen from '../components/pagos/TarjetasResumen'
import RecorridoAgente from '../components/seguimiento/RecorridoAgente'
import PendientesAgente from '../components/seguimiento/PendientesAgente'
import { colones } from '../utils/colones'
import { hoyEnCostaRica } from '../utils/fechaCR'

/**
 * Seguimiento de agentes (F5 del agente de ventas, 2026-10-29): el usuario
 * quiere al agente «completamente monitoreado». Un día de un agente: cuánto
 * vendió, a quién visitó, qué clientes no compraron y por qué, dónde estaba en
 * cada acción y —si es hoy— qué le falta.
 */
export default function SeguimientoAgentes() {
  const s = useSeguimientoAgente()
  const r = s.dia?.resumen
  const tarjetas = r ? [
    { clave: 'visitados', titulo: 'Clientes atendidos', icono: Users, valor: r.clientesVisitados, tono: 'neutro',
      pie: r.pendientes !== null ? `Le faltan ${r.pendientes} de hoy` : undefined },
    { clave: 'ventas', titulo: 'Facturas', icono: Receipt, valor: r.ventas, tono: 'exito', pie: colones(r.monto) },
    { clave: 'sinventa', titulo: 'No compraron', icono: CalendarClock, valor: r.sinVenta, tono: 'alerta' },
    { clave: 'singps', titulo: 'Sin ubicación', icono: MapPinOff, valor: r.sinGps, tono: r.sinGps ? 'peligro' : 'neutro',
      pie: r.fueraDeVisita ? `${r.fueraDeVisita} factura${r.fueraDeVisita === 1 ? '' : 's'} fuera de Preventa` : undefined },
    // Fichas que corrigió (rotación o ubicación): solo si corrigió alguna.
    ...(r.fichasCorregidas > 0 ? [{ clave: 'fichas', titulo: 'Fichas corregidas', icono: PencilLine, valor: r.fichasCorregidas, tono: 'neutro' }] : []),
    // Lo que cobró: solo si cobró (hoy el agente no tiene «Cobrar al facturar»).
    ...(r.cobrado > 0 ? [{ clave: 'cobrado', titulo: 'Cobró', icono: Banknote, valor: colones(r.cobrado), tono: 'exito' }] : [])
  ] : []

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-neutro-900"><IconoRecorrido className="text-primario-500" />Seguimiento de agentes</h1>
          <p className="mt-1 text-neutro-500">Qué hizo cada agente en el día, dónde y con qué resultado.</p>
        </div>
        <Boton variante="secundario" icono={RefreshCw} cargando={s.cargando} disabled={!s.agenteId} onClick={s.recargar}>Actualizar</Boton>
      </div>

      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-neutro-700">
          <span>Agente</span>
          <select aria-label="Agente" value={s.agenteId} onChange={e => s.setAgenteId(e.target.value)} className="input w-full">
            <option value="">Elegí un agente</option>
            {s.agentes.map(a => (
              <option key={a.id} value={a.id}>
                {a.nombre}{a.rutas.length ? ` · ${a.rutas.map(x => x.nombre).join(', ')}` : ''}{a.activo ? '' : ' (inactivo)'}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold text-neutro-700">
          <span>Día</span>
          <input type="date" aria-label="Día" value={s.fecha} max={hoyEnCostaRica()} onChange={e => e.target.value && s.setFecha(e.target.value)} className="input w-full" />
        </label>
        {s.agentes.length === 0 && !s.error && (
          <p className="text-sm text-neutro-500 sm:col-span-2">Todavía no hay agentes: aparecen cuando se les asignan rutas en Usuarios.</p>
        )}
      </div>

      {s.error && <p role="alert" className="rounded-xl bg-peligro-50 p-4 text-sm text-peligro-700">{s.error}</p>}
      {s.cargando && <p role="status" className="p-5 text-neutro-500">Consultando el día…</p>}

      {s.dia && !s.cargando && (
        <>
          <TarjetasResumen compacta tarjetas={tarjetas} />
          {r.sinGps > 0 && (
            <p className="flex items-center gap-2 rounded-xl bg-alerta-50 p-3 text-sm font-semibold text-alerta-800">
              <AlertTriangle size={16} />Hay acciones sin ubicación: revisá si el agente dio permiso de ubicación en su teléfono.
            </p>
          )}
          <section aria-label="Recorrido" className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-neutro-900"><ListOrdered size={18} className="text-primario-500" />Recorrido del día</h2>
            <RecorridoAgente recorrido={s.dia.recorrido} />
          </section>
          <PendientesAgente pendientes={s.dia.pendientes} />
        </>
      )}
    </div>
  )
}
