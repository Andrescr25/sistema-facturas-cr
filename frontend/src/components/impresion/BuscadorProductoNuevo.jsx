import { Search, Loader, Package, CheckCircle } from 'lucide-react'
import { getPriceValue, getReferenceFromSearchProduct, getDescriptionFromSearchProduct } from '../../utils/impresionUtils'

/**
 * Buscador de producto en Alegra para un ítem nuevo agregado a la factura
 * en edición. Solo se muestra para ítems marcados como `esNuevo`. Extraído
 * de Impresion.jsx (era renderBuscadorProducto).
 */
export default function BuscadorProductoNuevo({
  item,
  index,
  productoBusqueda,
  onIniciarBusqueda,
  onCambiarTermino,
  onSeleccionarProducto
}) {
  if (!item || !item.esNuevo) return null

  const esActivo = productoBusqueda.index === index
  const terminoActual = esActivo ? productoBusqueda.termino : ''

  return (
    <div className="border-t border-primario-100 pt-4">
      <p className="text-xs font-semibold text-primario-700 uppercase mb-2 flex items-center gap-2">
        <Search size={14} />
        Buscar producto en Alegra
      </p>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400 pointer-events-none" />
        <input
          type="text"
          value={terminoActual}
          onFocus={() => onIniciarBusqueda(index)}
          onChange={(e) => onCambiarTermino(index, e.target.value)}
          className="input input-sm w-full pl-10"
          placeholder="Escribe el código o parte del nombre..."
        />
      </div>

      <div className="mt-3">
        {esActivo ? (
          productoBusqueda.cargando ? (
            <div className="flex items-center gap-2 text-sm text-neutro-500">
              <Loader size={16} className="animate-spin" />
              Buscando productos…
            </div>
          ) : productoBusqueda.resultados.length > 0 ? (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {productoBusqueda.resultados.map((producto) => {
                const price = getPriceValue(producto.price ?? producto.prices ?? producto.salePrice ?? 0)
                const referencia = getReferenceFromSearchProduct(producto) || 'Sin referencia'
                const descripcion = getDescriptionFromSearchProduct(producto) || referencia || 'Producto sin nombre'

                return (
                  <div
                    key={producto.id}
                    className="p-3 border border-primario-100 rounded-md hover:border-primario-300 hover:bg-primario-50 transition cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-neutro-900">{descripcion}</p>
                        <p className="text-xs text-neutro-500">
                          Ref: {referencia} • Precio: ₡{Number(price).toLocaleString('es-CR')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSeleccionarProducto(index, producto)}
                        className="btn btn-sm btn-primary flex items-center gap-1"
                      >
                        <CheckCircle size={14} />
                        Usar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-xs text-neutro-500 py-4">
              <Package size={18} className="text-neutro-400" />
              <span>{productoBusqueda.error || 'Sin resultados para ese texto.'}</span>
            </div>
          )
        ) : (
          <p className="text-xs text-neutro-500">Empieza escribiendo para buscar en Alegra.</p>
        )}
      </div>
    </div>
  )
}
