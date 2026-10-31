import { Play, Timer } from 'lucide-react'
import Boton from '../ui/Boton'
import { useJornada } from '../../hooks/useJornada'

/**
 * En Preventa, si es empleado y no inició la jornada, se lo recuerda con el
 * botón a mano (2026-10-30): es donde arranca el día en la calle. Con la
 * jornada abierta no dice nada.
 */
export default function RecordatorioJornada() {
  const { estado, marcando, error, iniciar } = useJornada()
  if (!estado?.empleado || estado.abierta) return null
  return (
    <div className="card flex flex-col gap-3 border-2 border-primario-200 bg-primario-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2 font-semibold text-primario-900"><Timer size={18} className="shrink-0" />Todavía no iniciaste la jornada.</p>
      <Boton icono={Play} cargando={marcando} onClick={iniciar} className="w-full sm:w-auto">Iniciar jornada</Boton>
      {error && <p role="alert" className="text-sm text-peligro-700 sm:basis-full">{error}</p>}
    </div>
  )
}
