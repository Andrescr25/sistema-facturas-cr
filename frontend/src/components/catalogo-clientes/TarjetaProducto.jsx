import { Plus, Package } from 'lucide-react'
import { formatearColones } from '../../utils/catalogoClientesUtils'
import InputCantidad from './InputCantidad'

/**
 * Un producto, en tarjeta con la foto como protagonista.
 *
 * La imagen ocupa el ancho completo y el control de cantidad va DEBAJO, no
 * al costado: con la miniatura de 52px que había antes no se apreciaba el
 * producto —cuál rosca, cuál tamaño, qué marca— y para un cliente que elige
 * entre variantes parecidas eso es lo que decide la compra.
 *
 * Debajo de la imagen queda solo lo necesario: nombre, la nota que explica
 * por qué aparece, precio y un control. Sin relleno de más, para que entren
 * varias filas de tarjetas en la pantalla del teléfono.
 */
export default function TarjetaProducto({ producto, cantidad, onCambiar, nota, onAbrir }) {
  const enPedido = cantidad > 0
  // Sin sesión no se recibe `onCambiar`: la ficha queda de solo mirar. Un
  // botón "Agregar" que no lleva a ningún lado es peor que no tenerlo.
  const puedePedir = typeof onCambiar === 'function'

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden flex flex-col h-full transition-colors ${
      enPedido ? 'border-cliente-300' : 'border-neutro-200'
    }`}>
      <button
        type="button"
        onClick={onAbrir}
        disabled={!onAbrir}
        aria-label={onAbrir ? `Ver ${producto.nombre}` : undefined}
        className="relative aspect-square shrink-0 bg-white flex items-center justify-center overflow-hidden disabled:cursor-default"
      >
        {producto.imagen ? (
          <img
            src={producto.imagen}
            alt={producto.nombre}
            loading="lazy"
            className="w-full h-full object-contain p-2"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
          />
        ) : (
          <Package size={30} className="text-neutro-200" />
        )}

        {producto.descuento > 0 && (
          <span className="absolute top-2 left-2 bg-peligro-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md">
            −{producto.descuento}%
          </span>
        )}
        {puedePedir && enPedido && (
          <span className="absolute top-2 right-2 bg-cliente-600 text-white text-[10px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center">
            {cantidad}
          </span>
        )}
      </button>

      <div className="px-2.5 pb-2.5 pt-1 flex flex-col gap-1.5 flex-1 border-t border-neutro-100">
        <button
          type="button"
          onClick={onAbrir}
          disabled={!onAbrir}
          className="text-left disabled:cursor-default flex-1"
        >
          <p className="text-[12px] font-semibold text-neutro-900 leading-tight line-clamp-2 min-h-[30px]">
            {producto.nombre}
          </p>
          {nota && <p className="text-[10px] text-neutro-400 leading-tight mt-0.5">{nota}</p>}
        </button>

        <div className="flex items-baseline gap-1.5">
          {producto.precioLista && (
            <span className="text-[11px] text-neutro-300 line-through">
              {formatearColones(producto.precioLista)}
            </span>
          )}
          <span className={`text-[15px] font-extrabold ${producto.descuento ? 'text-peligro-600' : 'text-neutro-900'}`}>
            {formatearColones(producto.precio)}
          </span>
        </div>

        {/* Con cantidad 0, un solo botón: agregar tiene que ser UN toque. */}
        {!puedePedir ? null : enPedido ? (
          <InputCantidad
            cantidad={cantidad}
            onCambiar={(n) => onCambiar(producto, n)}
            etiqueta={producto.nombre}
            compacto
          />
        ) : (
          <button
            type="button"
            onClick={() => onCambiar(producto, 1)}
            className="h-9 rounded-lg bg-neutro-900 hover:bg-cliente-600 text-white text-[12px] font-bold flex items-center justify-center gap-1 transition-colors"
          >
            <Plus size={14} />
            Agregar
          </button>
        )}
      </div>
    </div>
  )
}
