import { PackagePlus, Search, X, Keyboard, Plus } from 'lucide-react'
import { getReference } from '../../utils/facturacionUtils'

/**
 * Paso 2: meter productos a la factura.
 *
 * DOS FORMAS DE AGREGAR, Y NO SON CAPRICHO
 * En el mostrador se factura con el teclado: código, Enter, cantidad, Enter,
 * y a la siguiente línea sin soltar las manos. Ese flujo no existe en un
 * teléfono —no hay lector ni teclado físico— así que ahí manda el buscador
 * por nombre. El selector entre los dos modos solo aparece de `md` para
 * arriba, que es donde el modo rápido tiene sentido; el hook ya se encarga
 * de forzar la búsqueda cuando la pantalla es angosta.
 */
export default function AgregarProductos({
  cardRef,
  modoEntradaRapida,
  setModoEntradaRapida,
  codigoInputRef,
  codigoProducto,
  onCodigoChange,
  onFocusCodigo,
  onCodigoKeyPress,
  productoPreviewRapido,
  cantidadInputRef,
  cantidadProducto,
  setCantidadProducto,
  onCantidadKeyPress,
  busquedaProductoInputRef,
  busquedaProducto,
  onBusquedaProductoChange,
  onFocusBusquedaProducto,
  onLimpiarBusquedaProducto,
  productosEncontrados,
  totalProductosEncontrados = 0,
  onSeleccionarProducto
}) {
  // Cuántos quedaron fuera por el tope de resultados.
  const ocultos = Math.max(0, totalProductosEncontrados - productosEncontrados.length)
  return (
    <div ref={cardRef} className="card rounded-2xl p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-bold text-neutro-900">
          <PackagePlus size={20} className="text-primario-600" />
          Agregar productos
        </h3>

        {/* El selector de modo, solo donde el modo rápido sirve. */}
        <div className="hidden shrink-0 rounded-xl bg-neutro-100 p-1 md:flex">
          <button
            onClick={() => setModoEntradaRapida(true)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              modoEntradaRapida ? 'bg-white text-primario-600 shadow-sm' : 'text-neutro-600 hover:text-neutro-900'
            }`}
          >
            <Keyboard size={14} /> Código
          </button>
          <button
            onClick={() => setModoEntradaRapida(false)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              !modoEntradaRapida ? 'bg-white text-primario-600 shadow-sm' : 'text-neutro-600 hover:text-neutro-900'
            }`}
          >
            <Search size={14} /> Buscar
          </button>
        </div>
      </div>

      {modoEntradaRapida ? (
        <div className="hidden gap-3 md:grid md:grid-cols-[1fr_9rem]">
          <div>
            <label className="label mb-1 block text-xs font-bold uppercase tracking-wider text-neutro-600">
              Código del producto
            </label>
            <input
              ref={codigoInputRef}
              type="text"
              value={codigoProducto}
              onChange={(e) => onCodigoChange(e.target.value)}
              onFocus={onFocusCodigo}
              onKeyPress={onCodigoKeyPress}
              placeholder="Código y Enter…"
              className="input h-12 w-full rounded-xl border-2 border-neutro-300 text-base focus:border-primario-500"
              autoFocus
            />
          </div>

          <div>
            <label className="label mb-1 block text-xs font-bold uppercase tracking-wider text-neutro-600">
              Cantidad
            </label>
            <input
              ref={cantidadInputRef}
              type="number"
              min="1"
              value={cantidadProducto}
              onChange={(e) => setCantidadProducto(e.target.value)}
              onKeyPress={onCantidadKeyPress}
              onFocus={(e) => e.target.select()}
              placeholder="1"
              className="input h-12 w-full rounded-xl border-2 border-neutro-300 text-base focus:border-primario-500"
              inputMode="numeric"
            />
          </div>

          {/* La ficha del producto que el código encontró, para confirmar
              antes de darle Enter a la cantidad. */}
          {productoPreviewRapido && (
            <div className="col-span-2 flex items-center justify-between gap-4 rounded-xl border border-primario-200 bg-primario-50 px-4 py-3">
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-primario-700">Encontrado</span>
                <p className="truncate font-bold text-neutro-900">{productoPreviewRapido.name}</p>
                <p className="text-xs text-neutro-500">Ref. {getReference(productoPreviewRapido.reference)}</p>
              </div>
              {productoPreviewRapido.price > 0 && (
                <span className="shrink-0 text-lg font-extrabold text-exito-600">
                  ₡{productoPreviewRapido.price.toLocaleString('es-CR')}
                </span>
              )}
            </div>
          )}

          <p className="col-span-2 text-xs text-neutro-500">
            Código <span className="font-semibold">→ Enter →</span> cantidad <span className="font-semibold">→ Enter</span>, sin soltar el teclado.
          </p>
        </div>
      ) : (
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutro-400" size={20} />
            <input
              ref={busquedaProductoInputRef}
              /* type="text", no "search": Chrome le agrega su propia equis y
                 quedaban dos, una al lado de la otra. */
              type="text"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              value={busquedaProducto}
              onChange={(e) => onBusquedaProductoChange(e.target.value)}
              onFocus={onFocusBusquedaProducto}
              placeholder="Buscar por nombre o código…"
              className="input h-14 w-full rounded-xl border-2 border-neutro-300 pl-12 pr-12 text-base focus:border-primario-500"
            />
            {busquedaProducto && (
              <button
                type="button"
                onClick={onLimpiarBusquedaProducto}
                aria-label="Limpiar búsqueda"
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutro-400 hover:bg-neutro-100 hover:text-neutro-700"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {productosEncontrados.length > 0 && (
            <div className="mt-3 max-h-[60vh] divide-y divide-neutro-100 overflow-y-auto overscroll-contain rounded-xl border border-neutro-200 sm:max-h-[28rem]">
              {productosEncontrados.map((producto) => (
                <button
                  key={producto.id}
                  onClick={() => onSeleccionarProducto(producto)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-primario-50 active:bg-primario-100"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug text-neutro-900">{producto.name}</p>
                    <p className="mt-0.5 text-xs text-neutro-500">Ref. {getReference(producto.reference)}</p>
                  </div>
                  {producto.price > 0 && (
                    <span className="shrink-0 font-bold text-exito-600">
                      ₡{producto.price.toLocaleString('es-CR')}
                    </span>
                  )}
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primario-100 text-primario-700">
                    <Plus size={18} strokeWidth={3} />
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Cuántos hay. Antes se recortaba en silencio y no había forma de
              saber que faltaban: buscar "anzuelo" mostraba 10 de 26 y el
              resto parecía no existir. */}
          {productosEncontrados.length > 0 && (
            <p className="mt-2 px-1 text-xs text-neutro-500">
              {ocultos > 0
                ? `Mostrando ${productosEncontrados.length} de ${totalProductosEncontrados}. Escribí un poco más para acortar la lista.`
                : `${totalProductosEncontrados} ${totalProductosEncontrados === 1 ? 'producto' : 'productos'}`}
            </p>
          )}

          {busquedaProducto && productosEncontrados.length === 0 && (
            <p className="mt-3 rounded-xl bg-neutro-50 px-4 py-3 text-center text-sm text-neutro-500">
              Nada coincide con «{busquedaProducto}».
            </p>
          )}
        </div>
      )}
    </div>
  )
}
