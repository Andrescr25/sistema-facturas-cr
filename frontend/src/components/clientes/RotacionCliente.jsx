import Insignia from '../ui/Insignia'
import { hoyEnCostaRica } from '../../utils/fechaCR'
import { diaEnPalabras, textoRotacion, visitaEnPalabras } from '../../utils/rotacionTexto'

/**
 * La rotación del cliente en su ficha: cada cuántos días se le visita,
 * cuándo fue su última atención (su última factura) y cuándo le toca.
 * Todo llega calculado del servidor; acá no se suma ninguna fecha.
 */
export default function RotacionCliente({ rotacion }) {
  if (!rotacion) return null
  const hoy = hoyEnCostaRica()
  const visita = visitaEnPalabras(rotacion, hoy)
  return (
    <div className="mt-4 border-t border-neutro-100 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-base font-bold text-neutro-900">Rotación: {textoRotacion(rotacion.dias).toLowerCase()}</p>
        <Insignia tono={visita.tono}>{visita.etiqueta}</Insignia>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-neutro-500">Última atención</dt>
          <dd className="mt-1 text-lg font-bold text-neutro-900">{diaEnPalabras(rotacion.ultimaAtencion, hoy) || 'Sin facturas'}</dd>
          {rotacion.ultimaAtencion && <dd className="text-sm text-neutro-500">La fecha de su última factura.</dd>}
        </div>
        <div>
          <dt className="text-sm font-medium text-neutro-500">Próxima visita</dt>
          <dd className="mt-1 text-lg font-bold text-neutro-900">{visita.cuando}</dd>
          <dd className="text-sm text-neutro-500">{visita.detalle}</dd>
        </div>
      </dl>
    </div>
  )
}
