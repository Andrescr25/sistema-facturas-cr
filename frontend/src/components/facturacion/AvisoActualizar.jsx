import { AlertCircle, RefreshCw } from 'lucide-react'

/**
 * Recordatorio de domingo y lunes: sincronizar antes de facturar.
 *
 * El botón de "Ya actualicé" usaba la clase `btn-ghost`, que no existe en
 * index.css — salía sin ningún estilo, como texto suelto. Ahora usa
 * `btn-outline`, que sí está definida.
 */
export default function AvisoActualizar({ isOnline, syncingCache, onActualizarCache, onOcultar }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-alerta-200 bg-alerta-50 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 shrink-0 text-alerta-600" size={20} />
        <div className="min-w-0">
          <p className="font-bold text-alerta-900">Actualizá antes de facturar</p>
          <p className="text-sm text-alerta-800">
            Los domingos y lunes conviene sincronizar el catálogo, para trabajar con los precios de hoy.
          </p>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          onClick={onActualizarCache}
          disabled={!isOnline || syncingCache}
          className="btn btn-primary flex flex-1 items-center justify-center gap-2 disabled:opacity-50 md:flex-initial"
        >
          <RefreshCw size={16} className={syncingCache ? 'animate-spin' : ''} />
          Actualizar
        </button>
        <button onClick={onOcultar} className="btn btn-outline flex-1 md:flex-initial">
          Ya actualicé
        </button>
      </div>
    </div>
  )
}
