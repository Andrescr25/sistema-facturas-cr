import { Minus, Plus, Check, X } from 'lucide-react'
import { getReference } from '../../utils/facturacionUtils'
import { useModal } from '../../hooks/useModal'

/**
 * Cuántas unidades entran de este producto.
 *
 * Se llamaba ModalCantidadMovil, pero sale igual en escritorio cuando se
 * agrega desde el buscador — el nombre mentía. En pantalla angosta sube
 * desde abajo como hoja; en grande es un diálogo centrado.
 *
 * Dos arreglos de paso: la animación invocaba `animate-slideUp`, que no
 * existe en index.css (la clase real es `animate-slide`), así que el modal
 * aparecía de golpe; y el botón verde de confirmar se ponía azul oscuro al
 * pasarle el mouse.
 */
export default function ModalCantidad({
  producto, cantidad, setCantidad, cantidadInputRef, onCerrar, onConfirmar
}) {
  useModal(onCerrar)

  const valor = parseInt(cantidad) || 0
  const invalido = valor <= 0

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-slide max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-2xl sm:pb-5"
      >
        {/* Agarradera: solo tiene sentido en la hoja que sube. */}
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutro-300 sm:hidden" />

        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold leading-snug text-neutro-900">{producto.name}</h3>
            <p className="mt-0.5 text-xs text-neutro-500">Ref. {getReference(producto.reference)}</p>
            {producto.price > 0 && (
              <p className="mt-1 text-lg font-extrabold text-exito-600">
                ₡{producto.price.toLocaleString('es-CR')}
              </p>
            )}
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutro-400 hover:bg-neutro-100 hover:text-neutro-700"
          >
            <X size={20} />
          </button>
        </div>

        <label className="label mb-2 block text-xs font-bold uppercase tracking-wider text-neutro-600">
          Cantidad
        </label>
        <div className="mb-5 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Quitar uno"
            onClick={() => valor > 1 && setCantidad(String(valor - 1))}
            disabled={valor <= 1}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neutro-100 text-neutro-700 transition-colors hover:bg-neutro-200 active:bg-neutro-300 disabled:opacity-40"
          >
            <Minus size={24} strokeWidth={3} />
          </button>

          <input
            ref={cantidadInputRef}
            type="number"
            min="1"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyPress={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onConfirmar() }
            }}
            placeholder="1"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Cantidad"
            className="h-14 w-20 shrink-0 rounded-2xl border-2 border-neutro-300 text-center text-2xl font-extrabold focus:border-primario-500 focus:outline-none"
          />

          <button
            type="button"
            aria-label="Agregar uno"
            onClick={() => setCantidad(String(valor + 1))}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primario-600 text-white transition-colors hover:bg-primario-700 active:bg-primario-800"
          >
            <Plus size={24} strokeWidth={3} />
          </button>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onCerrar} className="btn btn-outline flex-1 py-3">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={invalido}
            className="btn flex flex-1 items-center justify-center gap-2 bg-exito-600 py-3 font-bold text-white transition-colors hover:bg-exito-700 active:bg-exito-800 disabled:opacity-50"
          >
            <Check size={20} strokeWidth={3} /> Agregar
          </button>
        </div>
      </div>
    </div>
  )
}
