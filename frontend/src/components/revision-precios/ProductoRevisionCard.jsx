import { Package, Settings, AlertCircle, TrendingUp, TrendingDown, Edit3 } from 'lucide-react'
import { analizarProducto, calcularInfoCantidad } from '../../utils/revisionPreciosUtils'

/**
 * Tarjeta de análisis de un producto en revisión: comparativa de costo
 * anterior/nuevo, precio de venta actual, ajuste de nuevo precio, alertas
 * de margen, y sugerencia de precio. Extraído de RevisionPrecios.jsx (era
 * el cuerpo del .map de productos en la vista "revisión").
 */
const CLASE_ROTACION_LABEL = { A: 'rota rápido', B: 'rotación media', C: 'rota poco' }

export default function ProductoRevisionCard({
  producto,
  index,
  productosAlegra,
  preciosAjustados,
  sugerenciasPrecio,
  onAjustarPrecio,
  onAplicarPrecioSugerido,
  onAbrirFactor
}) {
  const analisis = analizarProducto(producto, { productosAlegra, preciosAjustados, sugerenciasPrecio })
  const infoCantidad = calcularInfoCantidad(producto)

  return (
    <div
      className={`relative rounded-xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden ${analisis.precioModificado
          ? 'bg-gradient-to-br from-alerta-50 to-alerta-100 border-2 border-alerta-400'
          : 'bg-white border-2 border-neutro-200'
        }`}
    >
      {/* Número de producto */}
      <div className="absolute top-0 left-0 bg-primario-600 text-white px-4 py-2 rounded-br-xl font-bold text-sm">
        #{index + 1}
      </div>

      <div className="p-6 pt-12">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-neutro-900 mb-2 flex items-center">
              <Package className="mr-2 text-primario-600" size={24} />
              {analisis.nombre}
            </h3>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="inline-flex items-center px-3 py-1 bg-neutro-100 rounded-full font-medium text-neutro-700">
                Código: <strong className="ml-1">{producto.codigoProveedor}</strong>
              </span>
              <span className="inline-flex items-center px-3 py-1 bg-primario-100 rounded-full font-medium text-primario-700">
                Cantidad: <strong className="ml-1">
                  {infoCantidad.cantidadRealFormateada} {producto.unidadMedida}
                  {infoCantidad.hayConversion && (
                    <span
                      className="text-xs text-primario-600 ml-2 cursor-help"
                      title={infoCantidad.tooltipText}
                    >
                      🔄 {infoCantidad.factorConversion >= 1 ? `×${infoCantidad.factorConversion}` : `(${producto.cantidad}→${infoCantidad.cantidadRealFormateada})`}
                    </span>
                  )}
                </strong>
              </span>
              {producto.mapeo && (
                <button
                  onClick={() => onAbrirFactor(producto)}
                  className="inline-flex items-center px-3 py-1 bg-primario-50 hover:bg-primario-100 text-primario-700 rounded-full font-bold text-xs border border-primario-200 transition active:scale-95 cursor-pointer"
                >
                  <Settings size={12} className="mr-1" />
                  Factor
                </button>
              )}
              <span className="inline-flex items-center px-3 py-1 bg-nota-100 rounded-full font-medium text-nota-700">
                Subtotal: <strong className="ml-1">₡{((producto.precioUnitario || 0) * (producto.cantidad || 0)).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</strong>
              </span>
            </div>
          </div>
          {analisis.precioModificado && (
            <span className="inline-flex rounded-full bg-alerta-500 text-white text-base px-4 py-2 flex items-center shadow-lg">
              <Edit3 size={18} className="mr-2" />
              Precio Ajustado
            </span>
          )}
        </div>

        {/* Alertas */}
        {analisis.alertas.length > 0 && (
          <div className="mb-5 space-y-2">
            {analisis.alertas.map((alerta, idx) => (
              <div
                key={idx}
                className={`flex items-center text-sm px-4 py-3 rounded-lg font-medium shadow-sm border-l-4 ${alerta.tipo === 'warning'
                    ? 'bg-alerta-50 text-alerta-900 border-alerta-500'
                    : 'bg-peligro-50 text-peligro-900 border-peligro-500'
                  }`}
              >
                <AlertCircle size={20} className="mr-3 flex-shrink-0" />
                <span>{alerta.mensaje}</span>
              </div>
            ))}
          </div>
        )}

        {/* Comparativa de Costo, Venta y Ajuste */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4 mt-6">

          {/* Tarjeta 1: Costo del Producto */}
          <div className="bg-neutro-50 border-2 border-neutro-300 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-neutro-500 uppercase tracking-wider block mb-2">Costo por Unidad (con IVA)</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-neutro-900">
                  ₡{(analisis.costoNuevoConIva || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {analisis.costoAnterior > 0 && (
                <div className="text-sm text-neutro-600 mt-2">
                  Costo anterior: <strong>₡{(analisis.costoAnterior || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</strong>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t-2 border-neutro-200">
              {analisis.cambioCosto !== 0 ? (
                <span className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-base font-extrabold ${analisis.cambioCosto > 0
                    ? 'bg-peligro-50 text-peligro-700 border border-peligro-200'
                    : 'bg-exito-50 text-exito-700 border border-exito-200'
                  }`}>
                  {analisis.cambioCosto > 0 ? (
                    <>
                      <TrendingUp size={18} /> Costo subió +{analisis.cambioCosto.toFixed(1)}%
                    </>
                  ) : (
                    <>
                      <TrendingDown size={18} /> Costo bajó {analisis.cambioCosto.toFixed(1)}%
                    </>
                  )}
                </span>
              ) : (
                <span className="text-neutro-400 text-base font-bold">Costo sin cambios</span>
              )}
            </div>
          </div>

          {/* Tarjeta 2: Precio de Venta Actual */}
          <div className="bg-primario-50 border-2 border-primario-200 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-primario-700 uppercase tracking-wider block mb-2">Precio de Venta Actual</span>
              <div className="text-3xl font-black text-primario-900">
                ₡{(analisis.precioVentaConIva || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-base text-primario-700 mt-1 font-bold">
                ₡{(analisis.precioVentaSinIva || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })} (sin IVA)
              </div>
            </div>

            <div className="mt-4 pt-4 border-t-2 border-primario-200 flex items-center justify-between">
              <span className="text-base font-bold text-primario-800">Margen Actual:</span>
              <span className={`px-4 py-1.5 rounded-xl font-bold text-lg shadow-sm text-white ${analisis.margenActual < 15 ? 'bg-peligro-500' :
                  analisis.margenActual < 20 ? 'bg-alerta-500 text-neutro-900' :
                    'bg-exito-500'
                }`}>
                {analisis.margenActual.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Tarjeta 3: Ajuste de Precio */}
          <div className={`${analisis.precioModificado ? 'bg-alerta-50 border-alerta-300' : 'bg-neutro-50 border-neutro-300'} border-2 rounded-2xl p-5 flex flex-col justify-between`}>
            <div>
              <span className="text-xs font-bold text-neutro-700 uppercase tracking-wider block mb-2">Nuevo Precio de Venta (sin IVA)</span>
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-neutro-500 font-bold text-2xl">₡</span>
                <input
                  type="number"
                  value={preciosAjustados[producto.id] !== undefined ? preciosAjustados[producto.id] : (analisis.precioVentaSinIva || 0)}
                  onChange={(e) => onAjustarPrecio(producto.id, e.target.value)}
                  step="5"
                  min="0"
                  className="w-full pl-10 pr-20 py-3 text-right font-black text-2xl border-2 border-neutro-300 rounded-xl focus:border-primario-500 focus:ring-4 focus:ring-primario-100 transition-all bg-white"
                  placeholder="Precio sin IVA"
                  style={{ height: '56px' }}
                />
                <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-xs text-neutro-400 font-extrabold uppercase">Sin IVA</span>
              </div>
              <div className="text-base text-neutro-600 mt-2.5 font-bold flex justify-between">
                <span>Con IVA:</span>
                <span>₡{(analisis.precioAjustadoConIva || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t-2 border-neutro-200 flex items-center justify-between">
              <span className="text-base font-bold text-neutro-700">Margen Nuevo:</span>
              {analisis.precioModificado ? (
                <span className={`px-4 py-1.5 rounded-xl font-bold text-lg shadow-sm text-white ${analisis.margenNuevo < 15 ? 'bg-peligro-500' :
                    analisis.margenNuevo < 20 ? 'bg-alerta-500 text-neutro-900' :
                      'bg-exito-500'
                  }`}>
                  {analisis.margenNuevo.toFixed(1)}%
                </span>
              ) : (
                <span className="text-neutro-400 font-extrabold">Sin cambios</span>
              )}
            </div>
          </div>

        </div>

        {/* Precio sugerido por el motor de precios (margen real medido por
            categoría + ajuste por rotación/exclusividad) — se muestra
            siempre que haya sugerencia, no solo cuando el margen ya está
            bajo: si el costo subió pero el margen nuevo "parece sano", el
            usuario igual debe poder ver y aplicar el precio recomendado. */}
        {analisis.precioSugeridoSinIva !== null && (
          <div className="bg-primario-50 border border-primario-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
            <div className="text-base text-primario-900 font-bold">
              💡 Precio Recomendado (margen {analisis.margenObjetivo}%
              {analisis.categoriaProducto ? ` · ${analisis.categoriaProducto}` : ''}
              {analisis.claseRotacion ? ` · ${CLASE_ROTACION_LABEL[analisis.claseRotacion] || analisis.claseRotacion}` : ''}):
              {' '}₡{analisis.precioSugeridoSinIva.toLocaleString('es-CR')} sin IVA (₡{Math.round(analisis.precioSugeridoConIva).toLocaleString('es-CR')} con IVA)
            </div>
            <button
              onClick={() => onAplicarPrecioSugerido(producto.id, analisis.precioSugeridoSinIva)}
              className="btn bg-primario-600 hover:bg-primario-700 text-white font-extrabold px-8 py-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-lg self-stretch sm:self-auto"
            >
              <TrendingUp size={20} />
              Aplicar Precio Sugerido
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
