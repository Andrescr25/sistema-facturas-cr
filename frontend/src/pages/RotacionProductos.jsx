import { Brain, RefreshCw } from 'lucide-react'
import { useRotacionProductos } from '../hooks/useRotacionProductos'

const SEMANA_OPTIONS = [4, 8, 12, 24]
const LIMITE_OPTIONS = [10, 25, 50, 100, 150]

const formatNumber = (value, options = {}) => {
  const formatter = new Intl.NumberFormat('es-CR', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    ...options
  })
  return formatter.format(value || 0)
}

const formatDate = (value) => {
  if (!value) return 'Sin registros recientes'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Sin registros recientes'
  }
  return date.toLocaleDateString('es-CR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

const formatCurrency = (value) => {
  return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const trendLabel = (value) => {
  if (value > 0) return 'en aumento'
  if (value < 0) return 'a la baja'
  return 'estable'
}

const trendClass = (value) => {
  if (value > 0) return 'text-green-600'
  if (value < 0) return 'text-red-600'
  return 'text-gray-600'
}

export default function RotacionProductos() {
  const {
    productos,
    resumen,
    insights,
    loading,
    error,
    config,
    setConfig,
    reload
  } = useRotacionProductos()

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Rotación de Productos</h1>
          <p className="text-gray-600 mt-1">
            Analiza qué tan seguido se repiten los faltantes por producto y detecta tendencias.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reload}
            className="btn btn-outline"
            disabled={loading}
          >
            <RefreshCw size={16} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="card bg-indigo-50 border-indigo-200 mb-6">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <label className="label text-indigo-800">Semanas a analizar</label>
            <select
              value={config.semanas}
              onChange={(e) => setConfig({ semanas: Number(e.target.value) })}
              className="input min-w-36"
              disabled={loading}
            >
              {SEMANA_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} semanas
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label text-indigo-800">Top de productos</label>
            <select
              value={config.limite}
              onChange={(e) => setConfig({ limite: Number(e.target.value) })}
              className="input min-w-36"
              disabled={loading}
            >
              {LIMITE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  Top {option}
                </option>
              ))}
            </select>
          </div>

          <p className="text-sm text-indigo-700">
            📈 Filtra por rango de semanas y cantidad de productos para detectar qué códigos requieren más seguimiento.
          </p>
        </div>
      </div>

      {resumen && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-6 mb-6">
          <div className="card">
            <p className="text-sm text-gray-600">Semanas analizadas</p>
            <p className="text-2xl font-semibold text-gray-900">{resumen.semanas_analizadas}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-600">Productos monitoreados</p>
            <p className="text-2xl font-semibold text-gray-900">{resumen.productos_analizados}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-600">Unidades faltantes</p>
            <p className="text-2xl font-semibold text-gray-900">{formatNumber(resumen.total_unidades)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-600">Registros</p>
            <p className="text-2xl font-semibold text-gray-900">{formatNumber(resumen.total_registros)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-600">Costo estimado</p>
            <p className="text-2xl font-semibold text-orange-600">₡{formatCurrency(resumen.costo_total)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-600">Margen perdido</p>
            <p className="text-2xl font-semibold text-red-600">₡{formatCurrency(resumen.margen_total)}</p>
          </div>
        </div>
      )}

      {insights && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Top margen perdido</h3>
            <ul className="space-y-2">
              {insights.top_margen.map((item) => (
                <li key={`margen-${item.codigo}`} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{item.nombre}</span>
                  <span className="font-semibold text-red-600">₡{formatCurrency(item.margen_total)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Mayor rotación</h3>
            <ul className="space-y-2">
              {insights.top_rotacion.map((item) => (
                <li key={`rotacion-${item.codigo}`} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{item.nombre}</span>
                  <span className="font-semibold text-blue-600">{formatNumber(item.cantidad_total)} und</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Mejor costo/beneficio</h3>
            <ul className="space-y-2">
              {insights.mejor_costo_beneficio.map((item) => (
                <li key={`beneficio-${item.codigo}`} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{item.nombre}</span>
                  <span className="font-semibold text-green-600">{(item.costo_beneficio * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {loading && (
        <div className="card text-center py-10">
          <RefreshCw className="mx-auto text-indigo-400 mb-3 animate-spin" size={32} />
          <p className="text-gray-700">Analizando rotación de productos...</p>
        </div>
      )}

      {error && (
        <div className="card bg-red-50 border-red-200">
          <p className="text-red-700">❌ {error}</p>
        </div>
      )}

      {!loading && !error && productos.length === 0 && (
        <div className="card text-center py-12">
          <Brain className="mx-auto text-indigo-400 mb-4" size={48} />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Sin historial suficiente</h3>
          <p className="text-gray-600">
            Todavía no hay productos con registros suficientes para las semanas seleccionadas.
          </p>
        </div>
      )}

      {!loading && !error && productos.length > 0 && (
        <div className="space-y-6">
          {productos.map((producto) => {
            const maxCantidad = Math.max(...producto.historial.map((h) => h.cantidad), 0) || 1
            return (
              <div key={producto.codigo} className="card border border-gray-200">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-gray-200">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{producto.nombre}</h3>
                    <p className="text-sm text-gray-600">
                      Código: {producto.codigo} • Proveedor: {producto.proveedor_nombre || 'Sin proveedor'}
                    </p>
                    <p className="text-xs text-gray-500">Último registro: {formatDate(producto.ultimo_registro)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${trendClass(producto.tendencia_reciente)}`}>
                      Tendencia {trendLabel(producto.tendencia_reciente)} (
                      {producto.tendencia_reciente > 0 ? '+' : ''}
                      {producto.tendencia_reciente} und)
                    </p>
                    <p className="text-xs text-gray-500">Comparación últimas 2 vs 2 semanas previas</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 pt-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Unidades faltantes</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {formatNumber(producto.cantidad_total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Margen perdido</p>
                    <p className="text-2xl font-semibold text-red-600">
                      ₡{formatCurrency(producto.margen_total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Costo promedio</p>
                    <p className="text-xl font-semibold text-gray-900">
                      ₡{formatCurrency(producto.precio_costo_promedio)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Precio venta prom.</p>
                    <p className="text-xl font-semibold text-gray-900">
                      ₡{formatCurrency(producto.precio_venta_promedio)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Margen unitario</p>
                    <p className="text-xl font-semibold text-gray-900">
                      ₡{formatCurrency(producto.margen_unitario_promedio)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Costo/Beneficio</p>
                    <p className="text-xl font-semibold text-green-700">
                      {(producto.costo_beneficio * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Historial semanal</h4>
                  {producto.historial?.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto pb-2 h-32 items-end">
                      {producto.historial.map((semana) => {
                        const height = (semana.cantidad / maxCantidad) * 100
                        return (
                          <div key={`${producto.codigo}-${semana.semana}-${semana.ano}`} className="flex flex-col items-center min-w-[40px]">
                            <div
                              className="w-4 rounded bg-indigo-400"
                              style={{ height: `${height}%` }}
                              title={`Semana ${semana.semana}/${semana.ano} • ${formatNumber(semana.cantidad)} und`}
                            />
                            <span className="text-[10px] text-gray-500 mt-1">{semana.semana}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Sin historial reciente.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

