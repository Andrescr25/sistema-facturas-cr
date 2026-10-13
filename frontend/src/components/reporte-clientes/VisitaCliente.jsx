import Insignia from '../ui/Insignia'
import { visitaEnPalabras, textoRotacion } from '../../utils/rotacionTexto'
import { hoyEnCostaRica } from '../../utils/fechaCR'

/** La ruta es la de la ficha de hoy; las fechas llegan calculadas del servidor. */
export default function VisitaCliente({ cliente }) {
  const visita = visitaEnPalabras(cliente.rotacion, hoyEnCostaRica())
  return (
    <div className="my-3 space-y-2 text-left">
      <p className="text-sm font-semibold text-neutro-700">{cliente.ruta?.nombre || 'Sin ruta asignada'}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Insignia tono={visita.tono}>{visita.etiqueta}</Insignia>
        <span className="text-sm font-semibold text-neutro-800">Próxima visita: {visita.cuando}</span>
      </div>
      <p className="text-sm text-neutro-500">{textoRotacion(cliente.rotacion?.dias)} · {visita.detalle}</p>
    </div>
  )
}
