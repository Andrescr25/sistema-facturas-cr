import { RefreshCw } from 'lucide-react'

/**
 * Título de Facturas en Bodega, con la misma forma que los demás módulos, y
 * cuándo se habló con Alegra por última vez. "Actualizar" le pide al
 * servidor que sincronice YA; el resto del tiempo la lista se refresca sola
 * sin hacer esperar a nadie.
 */
export default function HeaderBodega({ sincronizando, ultimaSync, onActualizar }) {
  const hora = ultimaSync
    ? new Date(ultimaSync).toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-neutro-900 sm:text-3xl">Facturas en Bodega</h1>
        <p className="mt-1 text-neutro-600">Alistá cada pedido y registrá lo que faltó.</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-neutro-500">
          {sincronizando ? 'Sincronizando…' : hora ? `Actualizado ${hora}` : ''}
        </span>
        <button
          type="button"
          onClick={onActualizar}
          disabled={sincronizando}
          className="btn btn-outline inline-flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw size={16} className={sincronizando ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>
    </div>
  )
}
