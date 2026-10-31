import { CalendarDays, MapPin, PencilLine } from 'lucide-react'
import Insignia from '../ui/Insignia'
import Boton from '../ui/Boton'
import Vacio from '../ui/Vacio'
import { duracion, nombreDelDia, ESTADOS_JORNADA } from '../../utils/ingresosTexto'
import { horaEnCostaRica } from '../../utils/fechaCR'
import { mapaDe } from '../../utils/seguimientoAgente'

function Punto({ gps, etiqueta }) {
  const mapa = mapaDe(gps)
  if (mapa) return <a href={mapa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-primario-700 hover:underline"><MapPin size={13} />{etiqueta}</a>
  if (!gps) return null
  return <span className="text-alerta-700">{etiqueta}: {gps.estado === 'negada' ? 'sin permiso de ubicación' : 'sin ubicación'}</span>
}

/**
 * Las horas de una quincena, día por día y tramo por tramo (2026-10-30). La
 * ve el empleado en «Mis ingresos» y el administrador en «Empleados»: con
 * `onCorregir`, cada tramo se puede corregir o anular.
 */
export default function HorasDeLaQuincena({ dias, onCorregir }) {
  if (!dias.length) return <Vacio icono={CalendarDays} titulo="Sin jornadas en esta quincena" descripcion="Cada día que se marque la jornada aparece acá con sus horas." />
  return (
    <ol className="space-y-3">
      {[...dias].reverse().map(d => (
        <li key={d.fecha} className="card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold text-neutro-900 first-letter:uppercase">{nombreDelDia(d.fecha)}</h3>
            <span className="text-lg font-bold text-primario-700">{duracion(d.minutos)}</span>
          </div>
          <ul className="mt-2 space-y-2">
            {d.tramos.map(t => {
              const estado = ESTADOS_JORNADA[t.estado] || ESTADOS_JORNADA.cerrada
              return (
                <li key={t.id} className={`rounded-xl border border-neutro-100 bg-neutro-50 p-3 text-sm ${t.estado === 'anulada' ? 'opacity-70' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`font-semibold text-neutro-800 ${t.estado === 'anulada' ? 'line-through' : ''}`}>
                      {horaEnCostaRica(t.inicio)} → {t.fin ? horaEnCostaRica(t.fin) : '…'}{t.estado === 'cerrada' ? ` · ${duracion(t.minutos)}` : ''}
                    </span>
                    <span className="flex items-center gap-2">
                      <Insignia tono={estado.tono}>{estado.nombre}</Insignia>
                      {onCorregir && t.estado !== 'anulada' && <Boton tamano="sm" variante="secundario" icono={PencilLine} onClick={() => onCorregir(t)}>Corregir</Boton>}
                    </span>
                  </div>
                  {!t.aMano && (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                      <Punto gps={t.gpsInicio} etiqueta="Entrada" />
                      <Punto gps={t.gpsFin} etiqueta="Salida" />
                    </p>
                  )}
                  {t.correccion && <p className="mt-1 text-xs text-neutro-500">{t.aMano ? 'Agregada' : 'Corregida'} por {t.correccion.por || 'el administrador'}: {t.correccion.motivo}</p>}
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ol>
  )
}
