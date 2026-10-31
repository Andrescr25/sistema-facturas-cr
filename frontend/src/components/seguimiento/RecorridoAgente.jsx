import { Receipt, CalendarClock, MapPin, Banknote, PencilLine, LogIn, LogOut } from 'lucide-react'
import Insignia from '../ui/Insignia'
import { colones } from '../../utils/colones'
import { fechaEnPalabras } from '../../utils/fechaCR'
import { nombreDelMotivo } from '../../utils/visitaPreventa'
import { lecturaDelGps, lecturaDeJornada } from '../../utils/seguimientoAgente'
import { duracion } from '../../utils/ingresosTexto'

const TONO_TEXTO = { exito: 'text-exito-700', alerta: 'text-alerta-700', neutro: 'text-neutro-500' }

/**
 * Lo que hizo el agente en el día, en orden de hora: cada factura y cada
 * «próxima visita», con dónde estaba y qué tan lejos del cliente (F5), y lo
 * que cobró (F6), que no lleva GPS: se registra en caja o al facturar. Y lo que
 * corrigió de las fichas desde la visita: rotación y punto en el mapa. Y su
 * jornada (2026-10-30): cuándo la inició y la terminó, y dónde estaba.
 */
function MarcaDeJornada({ paso: p }) {
  const entrada = p.jornada.evento === 'entrada'
  const gps = p.gps ? lecturaDeJornada(p.gps) : null
  const Icono = entrada ? LogIn : LogOut
  return (
    <li className="flex min-w-0 gap-3 rounded-2xl border border-primario-100 bg-primario-50 p-4 sm:p-5">
      <div className="flex w-14 shrink-0 flex-col items-center gap-1">
        <span className="text-sm font-bold text-neutro-900">{p.hora}</span>
        <Icono size={18} className="text-primario-600" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-bold text-neutro-900">
          {entrada ? 'Inició la jornada' : `Terminó la jornada · ${duracion(p.jornada.minutos)}`}
          {entrada && p.jornada.estado === 'sin_salida' && <Insignia tono="alerta">Sin salida</Insignia>}
        </p>
        {p.jornada.correccion && <p className="text-sm text-neutro-500">{p.jornada.aMano ? 'Agregada' : 'Corregida'} por {p.jornada.correccion.por}: {p.jornada.correccion.motivo}</p>}
        {gps && (
          <p className={`flex flex-wrap items-center gap-x-2 text-sm font-semibold ${TONO_TEXTO[gps.tono]}`}>
            <MapPin size={14} className="shrink-0" />{gps.texto}
            {gps.mapa && <a href={gps.mapa} target="_blank" rel="noopener noreferrer" className="font-bold text-primario-700 underline-offset-2 hover:underline">ver dónde</a>}
          </p>
        )}
      </div>
    </li>
  )
}

export default function RecorridoAgente({ recorrido }) {
  if (!recorrido.length) {
    return <div className="card p-8 text-center text-neutro-500">Ese día no facturó ni anotó visitas.</div>
  }
  return (
    <ol className="space-y-3">
      {recorrido.map((p, i) => {
        if (p.tipo === 'jornada') return <MarcaDeJornada key={`jornada-${p.jornada.id}-${p.jornada.evento}`} paso={p} />
        const cobro = p.tipo === 'cobro'
        const ficha = p.tipo === 'ficha'
        const gps = cobro || ficha ? null : lecturaDelGps(p.gps, p.cliente.ubicacionMaps)
        const venta = p.tipo === 'venta'
        const Icono = ficha ? PencilLine : cobro ? Banknote : venta ? Receipt : CalendarClock
        return (
          <li key={`${p.tipo}-${p.factura?.id ?? p.cobro?.id ?? i}-${p.hora}`} className="card flex min-w-0 gap-3 p-4 sm:p-5">
            <div className="flex w-14 shrink-0 flex-col items-center gap-1">
              <span className="text-sm font-bold text-neutro-900">{p.hora}</span>
              <Icono size={18} className={venta || cobro ? 'text-exito-600' : 'text-nota-600'} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="break-words font-bold text-neutro-900">{p.cliente.nombre}</p>
              {ficha ? (
                <div className="space-y-0.5 text-sm text-neutro-700">
                  {p.ficha.rotacion && <p>Cambió la rotación: {p.ficha.rotacion.antes ? `cada ${p.ficha.rotacion.antes}` : 'sin rotación'} → cada {p.ficha.rotacion.despues} días</p>}
                  {p.ficha.ubicacion && (
                    <p>{p.ficha.ubicacion.antes ? 'Corrigió' : 'Marcó'} la ubicación en el mapa{' '}
                      <a href={p.ficha.ubicacion.despues} target="_blank" rel="noopener noreferrer" className="font-bold text-primario-700 hover:underline">ver punto</a>
                    </p>
                  )}
                </div>
              ) : cobro ? (
                <p className="flex flex-wrap items-center gap-2 text-sm text-neutro-700">
                  <span>Cobró {colones(p.cobro.monto)} · {p.cobro.metodo}</span>
                  {p.cobro.anulado && <Insignia tono="peligro">Anulado</Insignia>}
                </p>
              ) : venta ? (
                <p className="flex flex-wrap items-center gap-2 text-sm text-neutro-700">
                  <span>Factura {p.factura.numero} · {colones(p.factura.total)}</span>
                  {p.factura.anulada && <Insignia tono="peligro">Anulada</Insignia>}
                </p>
              ) : (
                <p className="text-sm text-neutro-700">
                  No compró: {nombreDelMotivo(p.motivo)} · vuelve el {fechaEnPalabras(p.proximaFecha, { day: 'numeric', month: 'long' })}
                  {p.nota && <span className="block text-neutro-500">«{p.nota}»</span>}
                </p>
              )}
              {gps && (
                <p className={`flex flex-wrap items-center gap-x-2 text-sm font-semibold ${TONO_TEXTO[gps.tono]}`}>
                  <MapPin size={14} className="shrink-0" />{gps.texto}
                  {gps.mapa && <a href={gps.mapa} target="_blank" rel="noopener noreferrer" className="font-bold text-primario-700 underline-offset-2 hover:underline">ver dónde</a>}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
