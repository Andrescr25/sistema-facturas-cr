import { lazy, Suspense, useMemo, useState } from 'react'
import { Loader2, ChevronRight, Navigation, MapPin, MapPinOff } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { puntosDelDia } from '../../utils/planDelDia'
import { enlacesParaLlegar } from '../../utils/visitaPreventa'

const MapaDelDia = lazy(() => import('./MapaDelDia'))
const ENLACE = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-sm font-bold text-primario-800 ring-1 ring-inset ring-primario-200 hover:bg-primario-50'

/**
 * «Mapa del día» (parte 3 de «Mi día», 2026-11-01; lo eligió el usuario como
 * atajo): su día en el mapa, numerado y en orden. Tocar un número muestra ese
 * cliente con «Ver visita» y cómo llegar. Los que no tienen ubicación se
 * nombran abajo, para marcarla desde su visita.
 */
export default function ModalMapaDelDia({ clientes, siguiente, onVer, onCerrar }) {
  const { conPunto, sinPunto } = useMemo(() => puntosDelDia(clientes), [clientes])
  const [elegido, setElegido] = useState(siguiente && conPunto.some(p => p.id === siguiente) ? siguiente : null)
  const punto = conPunto.find(p => p.id === elegido)
  const cliente = clientes.find(x => x.cliente.id === elegido)?.cliente
  const llegar = cliente ? enlacesParaLlegar(cliente.ubicacion_maps) : null

  return (
    <Modal titulo="Mapa del día" ancho="2xl" onCerrar={onCerrar}>
      <div className="space-y-3 p-4 sm:p-5">
        {conPunto.length === 0 ? (
          <p className="rounded-xl bg-alerta-50 p-4 text-sm text-alerta-800">Ningún cliente de tu día tiene la ubicación marcada. Marcala desde su visita con «Marcar en el mapa».</p>
        ) : (
          <Suspense fallback={<div className="flex h-[55vh] min-h-[300px] items-center justify-center gap-2 rounded-xl bg-neutro-50 text-neutro-500"><Loader2 size={18} className="animate-spin" />Cargando el mapa…</div>}>
            <MapaDelDia puntos={conPunto} siguiente={siguiente} elegido={elegido} onElegir={setElegido} />
          </Suspense>
        )}
        {punto ? (
          <div className="card space-y-3 p-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-neutro-500">{punto.numero} de {clientes.length}{punto.atendido ? ' · ya visitado' : ''}</p>
              <p className="break-words text-lg font-bold text-neutro-900">{punto.nombre}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Boton icono={ChevronRight} onClick={() => onVer(punto.id)} className="col-span-2">Ver visita</Boton>
              {llegar.waze && <a href={llegar.waze} target="_blank" rel="noopener noreferrer" className={ENLACE}><Navigation size={15} />Waze</a>}
              {llegar.maps && <a href={llegar.maps} target="_blank" rel="noopener noreferrer" className={ENLACE}><MapPin size={15} />Maps</a>}
            </div>
          </div>
        ) : conPunto.length > 0 && <p className="text-sm text-neutro-500">Tocá un número para ver ese cliente.</p>}
        {sinPunto.length > 0 && (
          <div className="rounded-xl bg-neutro-50 p-3 text-sm text-neutro-700">
            <p className="flex items-center gap-1.5 font-semibold"><MapPinOff size={15} className="text-alerta-600" />Sin ubicación marcada</p>
            <ul className="mt-1 space-y-1">
              {sinPunto.map(p => (
                <li key={p.id}><button type="button" onClick={() => onVer(p.id)} className="text-left font-semibold text-primario-700 hover:underline">{p.numero}. {p.nombre}</button></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
