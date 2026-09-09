import { Minus, Plus, Trash2, StickyNote, ChevronUp } from 'lucide-react'
import { getReference } from '../../utils/facturacionUtils'

const colones = (n) => `₡${(Number(n) || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Una línea de la factura en curso.
 *
 * ERA DOS COMPONENTES EN UNO
 * La versión anterior devolvía un árbol distinto según `isMobile`: en el
 * teléfono el paso de cantidad con botones de 56px y el detalle plegable, en
 * escritorio una rejilla de tres columnas con precio y descuento. Mantener
 * las dos ramas costaba el doble y se habían ido separando solas.
 *
 * Ahora es una sola línea y lo que cambia con el ancho lo decide CSS:
 *
 *   · El paso de cantidad se ve igual en todo ancho, con el botón de 44px
 *     que un dedo acierta sin mirar. En escritorio no estorba y en el
 *     teléfono es lo único que se toca seguido.
 *   · Precio y descuento aparecen de `md` para arriba. No es un descarte por
 *     falta de espacio: se decidió que en el teléfono no se editen precios,
 *     porque se factura de pie y un precio cambiado sin querer sale caro.
 *   · La nota de línea se abre solo si hace falta, y viene abierta cuando la
 *     línea ya trae una escrita, para que nunca quede escondida.
 */
export default function LineaFactura({
  item,
  index,
  mostrarDetalle,
  onToggleDetalle,
  onEliminar,
  onCambiarCantidad,
  onValidarCantidad,
  onCambiarPrecio,
  onCambiarDescuento,
  onCambiarDescripcion,
  DESCRIPCION_MAX
}) {
  const cantidad = parseInt(item.quantity) || 0
  const subtotal = (item.quantity * item.price) * (1 - (item.discount || 0) / 100)
  const detalleAbierto = mostrarDetalle || Boolean(item.description)

  return (
    <article className="rounded-2xl border border-neutro-200 bg-white p-3 md:p-4">
      {/* Nombre y botón de quitar */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug text-neutro-900">{item.name}</p>
          <p className="mt-0.5 text-xs text-neutro-500">Ref. {getReference(item.reference)}</p>
        </div>
        <button
          onClick={() => onEliminar(index)}
          aria-label={`Quitar ${item.name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutro-400 transition-colors hover:bg-peligro-50 hover:text-peligro-600"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Cantidad y subtotal, la fila que de verdad se usa */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center overflow-hidden rounded-xl border border-neutro-300 bg-white">
          <button
            type="button"
            aria-label="Quitar uno"
            onClick={() => cantidad > 1 && onCambiarCantidad(index, cantidad - 1)}
            disabled={cantidad <= 1}
            className="flex h-11 w-11 items-center justify-center text-neutro-700 transition-colors hover:bg-neutro-100 active:bg-neutro-200 disabled:opacity-40"
          >
            <Minus size={18} strokeWidth={3} />
          </button>
          <input
            type="number"
            min="1"
            value={item.quantity}
            onChange={(e) => onCambiarCantidad(index, e.target.value)}
            onBlur={() => onValidarCantidad(index)}
            onFocus={(e) => e.target.select()}
            aria-label={`Cantidad de ${item.name}`}
            inputMode="numeric"
            className="h-11 w-14 border-0 bg-transparent text-center text-lg font-extrabold text-neutro-900 focus:outline-none"
          />
          <button
            type="button"
            aria-label="Agregar uno"
            onClick={() => onCambiarCantidad(index, cantidad + 1)}
            className="flex h-11 w-11 items-center justify-center bg-primario-600 text-white transition-colors hover:bg-primario-700 active:bg-primario-800"
          >
            <Plus size={18} strokeWidth={3} />
          </button>
        </div>

        <div className="min-w-0 text-right">
          <p className="text-xs text-neutro-500">
            {colones(item.price)} c/u
            {item.discount > 0 && <span className="ml-1 font-bold text-alerta-600">−{item.discount}%</span>}
          </p>
          <p className="text-lg font-extrabold leading-tight text-neutro-900">{colones(subtotal)}</p>
        </div>
      </div>

      {/* Precio y descuento: de tableta para arriba. */}
      <div className="mt-3 hidden gap-3 border-t border-neutro-100 pt-3 md:grid md:grid-cols-2">
        <div>
          <label className="label mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutro-600">
            Precio unitario
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.price}
            onChange={(e) => onCambiarPrecio(index, e.target.value)}
            className="input h-10 w-full rounded-xl border border-neutro-300 text-sm focus:border-primario-500"
            inputMode="decimal"
          />
        </div>
        <div>
          <label className="label mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutro-600">
            Descuento %
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={item.discount || 0}
            onChange={(e) => onCambiarDescuento(index, e.target.value)}
            className="input h-10 w-full rounded-xl border border-neutro-300 text-sm focus:border-primario-500"
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Nota de línea */}
      {detalleAbierto ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <label className="label text-[11px] font-bold uppercase tracking-wider text-neutro-600">
              Detalle en la factura
            </label>
            {!item.description && (
              <button
                type="button"
                onClick={() => onToggleDetalle(item.id)}
                className="flex items-center gap-1 text-xs font-semibold text-neutro-500 hover:text-neutro-800"
              >
                <ChevronUp size={14} /> Ocultar
              </button>
            )}
          </div>
          <textarea
            value={item.description || ''}
            onChange={(e) => onCambiarDescripcion(index, e.target.value)}
            maxLength={DESCRIPCION_MAX}
            rows={2}
            placeholder="Detalle adicional para esta línea"
            className="input w-full resize-none rounded-xl border border-neutro-300 text-sm focus:border-primario-500"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onToggleDetalle(item.id)}
          className="mt-3 flex items-center gap-1.5 text-xs font-bold text-primario-600 hover:text-primario-800"
        >
          <StickyNote size={14} /> Agregar detalle
        </button>
      )}
    </article>
  )
}
