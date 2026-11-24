import { textoPorcentaje } from '../../utils/descuentoCotizacion'

/**
 * «Descuento %» de la cotización (2026-11-24): uno solo para toda la
 * cotización, que el servidor pone en cada producto. Así el PDF muestra el
 * precio ya rebajado y facturarla conserva el descuento.
 *
 * Es cambiar el precio: sin el permiso «Cambiar precio y descuento» se ve el
 * que tiene, pero no se cambia (el servidor tampoco lo deja).
 */
export default function CampoDescuento({ valor, onCambiar, puedeCambiar, invalido }) {
  return (
    <div>
      <label htmlFor="descuento-cotizacion" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutro-400">
        Descuento
      </label>
      {puedeCambiar ? (
        <div className="flex items-center gap-2">
          <input
            id="descuento-cotizacion"
            type="text" inputMode="decimal" value={valor}
            onChange={(e) => onCambiar(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="0"
            aria-invalid={invalido || undefined}
            className={`w-20 rounded-xl border-2 py-2 text-center text-sm font-bold focus:outline-none ${
              invalido ? 'border-peligro-400 focus:border-peligro-500' : 'border-neutro-200 focus:border-acento-500'}`}
          />
          <span className="text-sm text-neutro-500">%</span>
        </div>
      ) : (
        <p className="py-2 text-sm font-bold text-neutro-700" title="Cambiarlo necesita el permiso «Cambiar precio y descuento»">
          {textoPorcentaje(valor)} %
        </p>
      )}
      {invalido && <p className="mt-1 text-[11px] font-semibold text-peligro-600">De 0 a 100.</p>}
    </div>
  )
}
