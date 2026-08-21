import { useState } from 'react'
import { X, Copy, Check, AlertTriangle } from 'lucide-react'

/**
 * Muestra el enlace recién generado.
 *
 * Se ve UNA sola vez: en la base queda solo el hash del token, igual que con
 * una contraseña. Por eso el aviso es explícito — si se cierra sin copiarlo,
 * hay que generar otro.
 */
export default function ModalInvitacion({ invitacion, onCerrar }) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(invitacion.enlace)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Sin permiso de portapapeles el texto igual está a la vista para
      // seleccionarlo a mano.
      setCopiado(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />

      <div className="relative bg-white w-full max-w-lg rounded-3xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-gray-900">Enlace para {invitacion.cliente}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Vence en {invitacion.diasVigencia} días. Mandáselo por donde prefieras.
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-gray-700 shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="bg-gray-50 border border-gray-150 rounded-2xl p-3 break-all text-xs font-mono text-gray-700">
          {invitacion.enlace}
        </div>

        <button
          type="button"
          onClick={copiar}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          {copiado ? <Check size={16} /> : <Copy size={16} />}
          {copiado ? 'Copiado' : 'Copiar enlace'}
        </button>

        <div className="flex items-start gap-2 bg-amber-50 border border-amber-150 rounded-2xl px-3 py-2.5">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Copialo ahora: no se vuelve a mostrar. Si lo perdés, generá otro — el anterior deja de servir.
          </p>
        </div>
      </div>
    </div>
  )
}
