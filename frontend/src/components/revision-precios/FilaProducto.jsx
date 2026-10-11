import { Settings, TrendingUp, TrendingDown, AlertTriangle, Sparkles } from 'lucide-react'
import { analizarProducto, calcularInfoCantidad } from '../../utils/revisionPreciosUtils'
import { formatCurrency } from '../../utils/pagos'

const ROTACION = { A: 'rota rápido', B: 'rotación media', C: 'rota poco' }

/** El margen manda el color: bajo es plata que no se está ganando. */
function colorMargen(margen) {
  if (margen < 15) return 'bg-peligro-100 text-peligro-800'
  if (margen < 20) return 'bg-alerta-100 text-alerta-800'
  return 'bg-exito-100 text-exito-800'
}

/**
 * Un producto de la factura, listo para revisarle el precio.
 *
 * DE TARJETA DE 400px A FILA
 * La versión anterior era una tarjeta con tres sub-tarjetas de `text-3xl`,
 * las alertas en banners de tres líneas y el precio sugerido en su propio
 * bloque. Medía cerca de 400px por producto. La factura promedio trae 10
 * productos y hay 122 facturas con más de 20 —la más grande, 89—, así que
 * revisar una era recorrer entre cuatro mil y treinta mil píxeles.
 *
 * Ahora es una fila. En escritorio las columnas se alinean entre productos,
 * que es lo que permite recorrer la columna de márgenes y ver de un vistazo
 * cuáles están mal; en el teléfono la misma marcación se apila sola. Una
 * sola versión, sin ramas de JavaScript.
 *
 * Lo que se muestra es lo que hace falta para decidir: cuánto costaba,
 * cuánto cuesta ahora, a cuánto se vende y con qué margen queda. Lo demás
 * —IVA desglosado, subtotal de línea— se sacó: no cambia la decisión.
 */
export default function FilaProducto({
  producto,
  productosDelCatalogo,
  preciosAjustados,
  sugerenciasPrecio,
  soloLectura = false,
  onAjustarPrecio,
  onAplicarPrecioSugerido,
  onAbrirFactor
}) {
  const a = analizarProducto(producto, { productosDelCatalogo, preciosAjustados, sugerenciasPrecio })
  const cantidad = calcularInfoCantidad(producto)

  const valorInput = preciosAjustados[producto.id] !== undefined
    ? preciosAjustados[producto.id]
    : (a.precioVentaSinIva || 0)

  return (
    <div className={`border-b border-neutro-100 p-3 last:border-b-0 md:grid md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1.3fr] md:items-center md:gap-4 md:px-4 ${
      a.precioModificado ? 'bg-alerta-50/60' : ''
    }`}>

      {/* ---- Producto ---- */}
      <div className="min-w-0">
        <p className="font-semibold leading-snug text-neutro-900">{a.nombre}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutro-500">
          <span>{producto.codigoProveedor}</span>
          <span>·</span>
          <span title={cantidad.tooltipText}>
            {cantidad.cantidadRealFormateada} {producto.unidadMedida}
            {cantidad.hayConversion && <span className="ml-1 text-primario-600">convertido</span>}
          </span>
          {producto.mapeo && !soloLectura && (
            <button
              type="button"
              onClick={() => onAbrirFactor(producto)}
              className="inline-flex items-center gap-1 rounded-md border border-neutro-200 px-1.5 py-0.5 font-semibold text-neutro-600 transition-colors hover:border-primario-300 hover:text-primario-700"
            >
              <Settings size={11} /> Factor
            </button>
          )}
        </div>

        {/* Las alertas van acá, en una línea. Antes eran banners de tres
            líneas que empujaban todo lo demás fuera de la pantalla. */}
        {a.alertas.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {a.alertas.map((alerta, i) => (
              <li
                key={i}
                className={`flex items-start gap-1.5 text-xs font-medium ${
                  alerta.tipo === 'warning' ? 'text-alerta-700' : 'text-peligro-700'
                }`}
              >
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                {alerta.mensaje}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- Costo ---- */}
      <div className="mt-2 flex items-baseline justify-between gap-2 md:mt-0 md:block">
        <span className="text-xs text-neutro-400 md:hidden">Costo</span>
        <div className="text-right md:text-left">
          <p className="font-bold text-neutro-900">{formatCurrency(a.costoNuevoConIva)}</p>
          {a.cambioCosto !== 0 ? (
            <span className={`inline-flex items-center gap-1 text-xs font-bold ${
              a.cambioCosto > 0 ? 'text-peligro-600' : 'text-exito-600'
            }`}>
              {a.cambioCosto > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {a.cambioCosto > 0 ? '+' : ''}{a.cambioCosto.toFixed(1)}%
            </span>
          ) : (
            <span className="text-xs text-neutro-400">sin cambio</span>
          )}
        </div>
      </div>

      {/* ---- Precio actual ---- */}
      <div className="mt-1 flex items-baseline justify-between gap-2 md:mt-0 md:block">
        <span className="text-xs text-neutro-400 md:hidden">Precio actual</span>
        <div className="text-right md:text-left">
          <p className="font-bold text-neutro-900">{formatCurrency(a.precioVentaConIva)}</p>
          <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${colorMargen(a.margenActual)}`}>
            {a.margenActual.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* ---- Precio nuevo ---- */}
      <div className="mt-2 md:mt-0">
        {soloLectura ? (
          <p className="text-sm text-neutro-400 md:text-right">—</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold text-neutro-400">₡</span>
                <input
                  type="number"
                  value={valorInput}
                  onChange={(e) => onAjustarPrecio(producto.id, e.target.value)}
                  step="5"
                  min="0"
                  aria-label={`Nuevo precio sin IVA de ${a.nombre}`}
                  className="input h-10 w-full rounded-lg border border-neutro-300 pl-6 pr-2 text-right font-bold focus:border-primario-500"
                />
              </div>
              {a.precioModificado && (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${colorMargen(a.margenNuevo)}`}>
                  {a.margenNuevo.toFixed(1)}%
                </span>
              )}
            </div>

            <p className="mt-1 text-xs text-neutro-400 md:text-right">
              sin IVA · con IVA {formatCurrency(a.precioAjustadoConIva)}
            </p>

            {/* El precio que sugiere el motor, en una línea con su botón.
                Se muestra siempre que haya sugerencia y no solo cuando el
                margen ya está bajo: si el costo subió pero el margen todavía
                "parece sano", igual conviene ver el recomendado. */}
            {a.precioSugeridoSinIva !== null && (
              <button
                type="button"
                onClick={() => onAplicarPrecioSugerido(producto.id, a.precioSugeridoSinIva)}
                title={`Deja ${a.margenSugerido !== null ? `${a.margenSugerido.toFixed(1)}% de margen` : 'el margen recomendado'} · meta de la categoría ${a.margenObjetivo}%${a.categoriaProducto ? ` · ${a.categoriaProducto}` : ''}${a.claseRotacion ? ` · ${ROTACION[a.claseRotacion] || a.claseRotacion}` : ''}`}
                className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-primario-200 bg-primario-50 px-2 py-1.5 text-xs font-bold text-primario-700 transition-colors hover:bg-primario-100"
              >
                <Sparkles size={12} className="shrink-0" />
                <span className="truncate">Sugerido {formatCurrency(a.precioSugeridoSinIva)}</span>
                {a.margenSugerido !== null && (
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${colorMargen(a.margenSugerido)}`}>
                    {a.margenSugerido.toFixed(1)}%
                  </span>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
