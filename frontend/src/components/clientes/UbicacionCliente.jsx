import { MapPin } from 'lucide-react'
export default function UbicacionCliente({ enlace }) {
  if (!enlace) return <span className="text-xs text-neutro-400">Sin ubicación Maps</span>
  return <a href={enlace} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primario-200 bg-primario-50 px-3 text-sm font-bold text-primario-800">
    <MapPin size={16} />Ver ubicación
  </a>
}
