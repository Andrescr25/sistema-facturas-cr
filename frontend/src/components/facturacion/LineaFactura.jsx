import { Trash2, StickyNote, ChevronUp } from 'lucide-react'
import Contador from '../ui/Contador'
import { getReference, montosLineaFacturacion } from '../../utils/facturacionUtils'
import VerFotoProducto from './VerFotoProducto'

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
 *   · Si el producto tiene foto, un botón pequeño junto al de quitar la abre
 *     (`foto` es la ruta; la página la busca en el catálogo por producto).
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
  DESCRIPCION_MAX,
  foto
}) {
  const subtotal = montosLineaFacturacion(item).base
  const detalleAbierto = mostrarDetalle || Boolean(item.description)

  return (
    <article className="rounded-2xl border border-neutro-200 bg-white p-3 md:p-4">
      {/* Nombre y botón de quitar */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug text-neutro-900">{item.name}</p>
          <p className="mt-0.5 text-xs text-neutro-500">Ref. {getReference(item.reference)}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <VerFotoProducto nombre={item.name} referencia={item.reference} foto={foto} />
          <button
            onClick={() => onEliminar(index)}
            aria-label={`Quitar ${item.name}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutro-400 transition-colors hover:bg-peligro-50 hover:text-peligro-600"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Cantidad y subtotal, la fila que de verdad se usa */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <Contador
          valor={item.quantity}
          min={1}
          onCambiar={(v) => onCambiarCantidad(index, v)}
          onBlur={() => onValidarCantidad(index)}
          etiqueta={`Cantidad de ${item.name}`}
        />

        <div className="min-w-0 text-right">
          <p className="text-xs text-neutro-500">
            {colones(item.price)} c/u
            {item.discount > 0 && <span className="ml-1 font-bold text-alerta-600">−{item.discount}%</span>}
          </p>
          {/* De dónde viene el descuento: si es una oferta de exceso, el
              cajero tiene que saber que no lo escribió nadie a mano —y que es
              la misma que el cliente vio en el catálogo—. Si lo cambió, deja
              de decirlo. */}
          {item.ofertaExceso > 0 && item.discount === item.ofertaExceso && (
            <p className="text-[10px] font-bold uppercase tracking-wide text-exito-600">
              Oferta de exceso
            </p>
          )}
          {item.descuentoCliente > 0 && item.discount === item.descuentoCliente && (
            <p className="text-[10px] font-bold uppercase tracking-wide text-nota-700">Descuento del cliente</p>
          )}
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
          className="mt-2 flex min-h-10 items-center gap-1.5 text-sm font-bold text-primario-600 hover:text-primario-800 md:mt-3 md:min-h-0 md:text-xs"
        >
          <StickyNote size={14} /> Agregar detalle
        </button>
      )}
    </article>
  )
}
