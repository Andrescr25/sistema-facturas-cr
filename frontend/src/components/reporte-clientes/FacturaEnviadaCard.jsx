import { useState } from 'react'
import { ChevronDown, RotateCcw } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import { fechaCorta, fechaHoraEnCostaRica } from '../../utils/fechaCR'

/** La ficha conserva productos y respuestas; archivo no significa impresa:
 * una factura enviada hace 24 h puede seguir pendiente en la cola de Impresión.
 */
export default function FacturaEnviadaCard({ factura, estado, onRecuperar }) {
  const [verProductos, setVerProductos] = useState(false)
  const enCola = estado.estado === 'en_cola_impresion'
  return (
    <article className="overflow-hidden rounded-2xl border border-neutro-200 bg-white">
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-neutro-900">Factura #{factura.numero_factura}</h3>
          <Insignia tono={enCola ? 'nota' : 'exito'}>{enCola ? 'En impresión' : 'Procesada'}</Insignia>
        </div>
        <div className="space-y-1 text-xs text-neutro-500">
          <div>Fecha factura: <span className="font-medium text-neutro-700">{fechaCorta(factura.fecha_emision)}</span></div>
          {factura.enviada_a_impresion_en && <div>Enviada a Impresión: <span className="font-medium text-neutro-700">{fechaHoraEnCostaRica(factura.enviada_a_impresion_en)}</span></div>}
          <div>Última gestión: <span className="font-medium text-neutro-700">{fechaHoraEnCostaRica(factura.ultima_gestion_en)}</span></div>
          {factura.historial_desde && <div>En historial desde: <span className="font-medium text-neutro-700">{fechaHoraEnCostaRica(factura.historial_desde)}</span></div>}
        </div>
        {factura.observaciones_adicionales && <p className="break-words text-sm text-neutro-600">{factura.observaciones_adicionales}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          <Boton type="button" variante="fantasma" tamano="sm" className="min-h-11" aria-expanded={verProductos} onClick={() => setVerProductos(v => !v)}>
            <ChevronDown size={15} /> {verProductos ? 'Ocultar' : 'Ver'} {factura.productos_faltantes.length} producto{factura.productos_faltantes.length !== 1 ? 's' : ''}
          </Boton>
          <Boton type="button" variante="secundario" tamano="sm" className="min-h-11" onClick={() => onRecuperar(factura)}>
            <RotateCcw size={14} /> Recuperar
          </Boton>
        </div>
      </div>
      {verProductos && (
        <ul className="divide-y divide-neutro-100 border-t border-neutro-100">
          {factura.productos_faltantes.map(p => (
            <li key={p.faltante_id} className="space-y-1 px-5 py-3 text-sm">
              <p className="break-words font-semibold text-neutro-800">{p.nombre}</p>
              <p className="text-xs text-neutro-500">{p.codigo} · {p.proveedor_asignado || p.proveedor}</p>
              <p className="text-neutro-600">Faltaban {p.cantidad_faltante} · Llegaron {p.cantidad_entregada}</p>
              {p.observaciones && <p className="break-words text-xs text-neutro-500">{p.observaciones}</p>}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
