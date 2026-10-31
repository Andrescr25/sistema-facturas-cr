import { useEffect, useState } from 'react'
import { Play, Square, AlertTriangle, Timer } from 'lucide-react'
import Boton from '../ui/Boton'
import { duracion, minutosDesde, nombreDelDia } from '../../utils/ingresosTexto'
import { horaEnCostaRica } from '../../utils/fechaCR'

/**
 * Marcar la jornada (2026-10-30): el usuario decidió que el agente «marca
 * entrada y salida». Un botón grande, porque se toca en la calle con una mano;
 * mientras trabaja, cuánto lleva. Las que quedaron sin salida se avisan: no
 * cuentan hasta que el administrador las corrija.
 *
 * @param {ReturnType<import('../../hooks/useJornada').useJornada>} jornada
 */
export default function TarjetaJornada({ jornada }) {
  const { estado, marcando, error, iniciar, terminar } = jornada
  const [ahora, setAhora] = useState(() => new Date())
  const abierta = estado?.abierta

  useEffect(() => {
    if (!abierta) return undefined
    const reloj = setInterval(() => setAhora(new Date()), 30000)
    return () => clearInterval(reloj)
  }, [abierta])

  if (!estado) return <p role="status" className="card p-5 text-neutro-500">{error || 'Consultando tu jornada…'}</p>

  return (
    <section aria-label="Jornada" className={`card space-y-4 border-2 p-5 ${abierta ? 'border-primario-200 bg-primario-50' : 'border-neutro-200'}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${abierta ? 'bg-primario-600 text-white' : 'bg-neutro-100 text-neutro-500'}`}>
            <Timer size={24} />
          </span>
          <div>
            <p className="text-lg font-bold text-neutro-900">{abierta ? `Trabajando desde las ${horaEnCostaRica(abierta.inicio)}` : 'Jornada sin iniciar'}</p>
            <p className="text-sm text-neutro-600">
              {abierta ? `Llevás ${duracion(minutosDesde(abierta.inicio, ahora))}` : 'Iniciala al empezar a trabajar y terminala al acabar.'}
            </p>
          </div>
        </div>
        {abierta
          ? <Boton tamano="lg" variante="alerta" icono={Square} cargando={marcando} onClick={terminar} className="w-full sm:w-auto">Terminar jornada</Boton>
          : <Boton tamano="lg" icono={Play} cargando={marcando} onClick={iniciar} className="w-full sm:w-auto">Iniciar jornada</Boton>}
      </div>

      {estado.sinSalida.map(j => (
        <p key={j.id} className="flex items-start gap-2 rounded-xl bg-alerta-50 p-3 text-sm font-semibold text-alerta-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          La jornada del {nombreDelDia(j.fecha)} (entrada {horaEnCostaRica(j.inicio)}) quedó sin salida: no cuenta hasta que el administrador la corrija.
        </p>
      ))}
      {error && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}
      <p className="text-xs text-neutro-500">Se anota la hora del sistema y tu ubicación en ese momento.</p>
    </section>
  )
}
