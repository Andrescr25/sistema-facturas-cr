import { ChevronRight, Timer, AlertTriangle } from 'lucide-react'
import Insignia from '../ui/Insignia'
import { colones } from '../../utils/colones'
import { duracion } from '../../utils/ingresosTexto'
import { horaEnCostaRica } from '../../utils/fechaCR'

/** Un empleado en la lista: si está trabajando y lo de su quincena en curso. Toda la tarjeta abre el detalle. */
export default function TarjetaEmpleado({ empleado, onAbrir }) {
  const { jornada, quincena } = empleado
  return (
    <button type="button" onClick={onAbrir}
      className="card flex w-full items-center gap-4 p-5 text-left transition-colors hover:border-primario-300 hover:bg-primario-50/40">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-neutro-900">{empleado.nombre}</h2>
          {!empleado.activo && <Insignia tono="neutro">Inactivo</Insignia>}
          {jornada.abierta && <Insignia tono="activo" icono={Timer}>Trabajando desde {horaEnCostaRica(jornada.abierta.inicio)}</Insignia>}
          {jornada.sinSalida.length > 0 && <Insignia tono="alerta" icono={AlertTriangle}>{jornada.sinSalida.length} sin salida</Insignia>}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-neutro-500">Horas de la quincena</dt><dd className="text-base font-bold text-neutro-900">{duracion(quincena.minutos)}</dd></div>
          <div><dt className="text-neutro-500">Ganado por horas</dt><dd className="text-base font-bold text-exito-700">{colones(quincena.porHoras)}</dd></div>
          <div><dt className="text-neutro-500">Clientes nuevos</dt><dd className="text-base font-bold text-exito-700">{colones(quincena.clientesNuevos.monto)}</dd></div>
        </dl>
      </div>
      <ChevronRight className="shrink-0 text-neutro-400" />
    </button>
  )
}
