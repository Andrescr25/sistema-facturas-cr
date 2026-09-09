import { PencilLine, X } from 'lucide-react'

/** Recordatorio de que lo que está en pantalla es una factura existente. */
export default function AvisoEdicion({ facturaEditando, onCancelar }) {
  const numero = facturaEditando.numberTemplate?.fullNumber || facturaEditando.id

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border-l-4 border-alerta-600 bg-alerta-50 p-3 md:p-4">
      <PencilLine className="hidden shrink-0 text-alerta-600 sm:block" size={20} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-alerta-900">Editando la factura #{numero}</p>
        <p className="truncate text-sm text-alerta-700">Guardá cuando termines los cambios.</p>
      </div>
      <button
        onClick={onCancelar}
        aria-label="Cancelar edición"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-alerta-600 hover:bg-alerta-100"
      >
        <X size={18} />
      </button>
    </div>
  )
}
