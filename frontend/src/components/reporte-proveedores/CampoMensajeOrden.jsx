import { MessageSquare } from 'lucide-react'

/**
 * El mensaje que acompaña el PDF de la orden por WhatsApp (2026-11-18). Trae
 * el de siempre y se puede cambiar solo para este envío; lo escrito es lo que
 * sale. Lo usan Enviar y Volver a enviar.
 */
export default function CampoMensajeOrden({ id, valor, onCambiar, deshabilitado }) {
  const vacio = !valor.trim()
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-center gap-2 text-xs font-bold text-neutro-600">
        <MessageSquare size={16} />Mensaje para este envío
      </label>
      <textarea id={id} rows={3} value={valor} maxLength={2000} disabled={deshabilitado}
        onChange={e => onCambiar(e.target.value)} aria-invalid={vacio}
        className="input w-full rounded-2xl border border-neutro-300 p-4 text-sm leading-relaxed text-neutro-800" />
      {vacio && <p className="mt-1 text-xs text-peligro-700">Escribí un mensaje para el proveedor.</p>}
    </div>
  )
}
