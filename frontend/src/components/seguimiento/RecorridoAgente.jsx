import { Receipt, CalendarClock, MapPin } from 'lucide-react'
import Insignia from '../ui/Insignia'
import { colones } from '../../utils/colones'
import { fechaEnPalabras } from '../../utils/fechaCR'
import { nombreDelMotivo } from '../../utils/visitaPreventa'
import { lecturaDelGps } from '../../utils/seguimientoAgente'

const TONO_TEXTO = { exito: 'text-exito-700', alerta: 'text-alerta-700', neutro: 'text-neutro-500' }

/**
 * Lo que hizo el agente en el día, en orden de hora: cada factura y cada
 * «próxima visita», con dónde estaba y qué tan lejos del cliente (F5).
 */
export default function RecorridoAgente({ recorrido }) {
  if (!recorrido.length) {
    return <div className="card p-8 text-center text-neutro-500">Ese día no facturó ni anotó visitas.</div>
  }
  return (
    <ol className="space-y-3">
      {recorrido.map((p, i) => {
        const gps = lecturaDelGps(p.gps, p.cliente.ubicacionMaps)
        const venta = p.tipo === 'venta'
        const Icono = venta ? Receipt : CalendarClock
        return (
          <li key={`${p.tipo}-${p.factura?.id ?? i}-${p.hora}`} className="card flex min-w-0 gap-3 p-4 sm:p-5">
            <div className="flex w-14 shrink-0 flex-col items-center gap-1">
              <span className="text-sm font-bold text-neutro-900">{p.hora}</span>
              <Icono size={18} className={venta ? 'text-exito-600' : 'text-nota-600'} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="break-words font-bold text-neutro-900">{p.cliente.nombre}</p>
              {venta ? (
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
              <p className={`flex flex-wrap items-center gap-x-2 text-sm font-semibold ${TONO_TEXTO[gps.tono]}`}>
                <MapPin size={14} className="shrink-0" />{gps.texto}
                {gps.mapa && <a href={gps.mapa} target="_blank" rel="noopener noreferrer" className="font-bold text-primario-700 underline-offset-2 hover:underline">ver dónde</a>}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
