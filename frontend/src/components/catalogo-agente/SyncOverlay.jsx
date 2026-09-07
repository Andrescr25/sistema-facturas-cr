import { RefreshCw } from 'lucide-react'

/**
 * Lo que se ve mientras baja el catálogo.
 *
 * Ocupa la pantalla entera a propósito: la sincronización tarda y descarga
 * miles de fotos, y si el agente cierra la pestaña a la mitad la tablet queda
 * con un catálogo incompleto sin avisar. El aviso de no cerrar es lo único
 * que de verdad hay que leer acá.
 */
export default function SyncOverlay({ isSyncing, syncProgress }) {
  if (!isSyncing) return null

  const porcentaje = Math.max(0, Math.min(100, Number(syncProgress?.percent) || 0))

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-primario-900/95 px-8 text-center backdrop-blur-sm">
      <RefreshCw size={30} className="animate-spin text-acento-400" />
      <div>
        <p className="text-base font-extrabold text-white">Actualizando el catálogo</p>
        <p className="mt-1 text-xs text-white/60">{syncProgress?.message || 'Un momento…'}</p>
      </div>

      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-acento-500 transition-[width] duration-300"
          style={{ width: `${porcentaje}%` }} />
      </div>

      <p className="text-[11px] font-bold text-alerta-300">
        No cierres esta pestaña hasta que termine.
      </p>
    </div>
  )
}
