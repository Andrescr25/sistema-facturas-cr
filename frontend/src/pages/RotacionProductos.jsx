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
    loading,
    error,
    config,
    setConfig,
    reload
  } = useRotacionProductos()

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Rotación de Productos</h1>
          <p className="text-gray-600 mt-1">
            Analiza qué tan seguido se repiten los faltantes por producto y detecta tendencias.
          </p>
        </div>
        <button
          onClick={reload}
          className="btn btn-outline"
          disabled={loading}
        >
          <RefreshCw size={16} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="card">
            <p className="text-sm text-gray-600">Semanas analizadas</p>
            <p className="text-2xl font-semibold text-gray-900">{resumen.semanas_analizadas}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-600">Productos monitoreados</p>
            <p className="text-2xl font-semibold text-gray-900">{resumen.productos_analizados}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-600">Unidades registradas</p>
            <p className="text-2xl font-semibold text-gray-900">{formatNumber(resumen.total_unidades)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-600">Registros totales</p>
            <p className="text-2xl font-semibold text-gray-900">{formatNumber(resumen.total_registros)}</p>
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
          {productos.map((producto) => (
            <div key={producto.codigo} className="card border border-gray-200">
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-gray-200">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{producto.nombre}</h3>
                  <p className="text-sm text-gray-600">Código: {producto.codigo}</p>
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

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Unidades registradas</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatNumber(producto.cantidad_total)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Registros</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatNumber(producto.registros_total)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Promedio semanal</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatNumber(producto.promedio_semanal, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Semanas con movimiento</p>
                  <p className="text-2xl font-semibold text-gray-900">{producto.semanas_con_movimiento}</p>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Historial semanal</h4>
                {producto.historial?.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {producto.historial.map((semana) => (
                      <div
                        key={`${producto.codigo}-${semana.semana}-${semana.ano}`}
                        className="min-w-[140px] bg-gray-50 border border-gray-200 rounded-lg p-3"
                      >
                        <p className="text-xs text-gray-500">{semana.etiqueta}</p>
                        <p className="text-lg font-semibold text-gray-900">{formatNumber(semana.cantidad)}</p>
                        <p className="text-xs text-gray-500">
                          {semana.registros} registro{semana.registros === 1 ? '' : 's'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Sin historial reciente.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

