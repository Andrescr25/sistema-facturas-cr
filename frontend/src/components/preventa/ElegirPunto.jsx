import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigation, Loader2 } from 'lucide-react'
import Boton from '../ui/Boton'
import { tomarUbicacion } from '../../services/ubicacionService'

const MapaUbicacion = lazy(() => import('./MapaUbicacion'))
const COSTA_RICA = { lat: 9.93, lng: -84.08, zoom: 8 }

/**
 * Marcar el punto exacto del local (2026-10-29). Si ya hay punto, abre ahí; si
 * no, centra donde está el agente sin poner el marcador (el local puede no ser
 * donde está parado). «Usar mi ubicación» sí lo pone, para cuando está en la
 * puerta. Lo usan «Ubicación» de un cliente y «Cliente nuevo».
 */
export default function ElegirPunto({ punto, onCambiar, alto }) {
  const [vista, setVista] = useState(punto ? { ...punto, zoom: 17 } : COSTA_RICA)
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    if (punto) return
    let vivo = true
    tomarUbicacion().then(u => { if (vivo && u.estado === 'tomada') setVista({ lat: u.latitud, lng: u.longitud, zoom: 17 }) })
    return () => { vivo = false }
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const usarMiUbicacion = async () => {
    setBuscando(true); setAviso('')
    const u = await tomarUbicacion()
    setBuscando(false)
    if (u.estado !== 'tomada') return setAviso(u.estado === 'negada' ? 'El teléfono no dio permiso de ubicación.' : 'El teléfono no dio la ubicación. Marcá el punto a mano.')
    onCambiar({ lat: u.latitud, lng: u.longitud })
    setVista({ lat: u.latitud, lng: u.longitud, zoom: 18 })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutro-600">Tocá el mapa donde está el local, o arrastrá el marcador para ajustarlo.</p>
      <Suspense fallback={<div className="flex h-[40vh] min-h-[240px] items-center justify-center gap-2 rounded-xl bg-neutro-50 text-neutro-500"><Loader2 size={18} className="animate-spin" />Cargando el mapa…</div>}>
        <MapaUbicacion punto={punto} vista={vista} onCambiar={onCambiar} alto={alto} />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Boton variante="secundario" icono={Navigation} onClick={usarMiUbicacion} cargando={buscando}>Usar mi ubicación</Boton>
        <span className="text-xs text-neutro-500">{punto ? `${punto.lat.toFixed(6)}, ${punto.lng.toFixed(6)}` : 'Todavía sin punto'}</span>
      </div>
      {aviso && <p className="rounded-xl bg-alerta-50 px-3 py-2 text-sm text-alerta-800">{aviso}</p>}
    </div>
  )
}
