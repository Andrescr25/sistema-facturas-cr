import { Brain, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useState, useMemo } from 'react'
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

  const [sortBy, setSortBy] = useState('promedio') // 'promedio' | 'total' | 'nombre' | 'semanas'
  const [sortOrder, setSortOrder] = useState('desc') // 'asc' | 'desc'

  // Calcular promedio semanal general
  const promedioGeneral = useMemo(() => {
    if (!resumen || !resumen.semanas_analizadas) return 0
    return (resumen.total_unidades / resumen.semanas_analizadas).toFixed(1)
  }, [resumen])

  // Productos con datos calculados y ordenados
  const productosConDatos = useMemo(() => {
    const conDatos = productos.map(producto => {
      const numSemanas = producto.historial?.length || 1
      const promedioSemanal = (producto.cantidad_total / numSemanas).toFixed(1)
      const semanasConFaltantes = producto.historial?.filter(s => s.cantidad > 0).length || 0

      return {
        ...producto,
        promedioSemanal: parseFloat(promedioSemanal),
        numSemanas,
        semanasConFaltantes
      }
    })

    // Ordenar
    const sorted = [...conDatos].sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'promedio':
          comparison = a.promedioSemanal - b.promedioSemanal
          break
        case 'total':
          comparison = a.cantidad_total - b.cantidad_total
          break
        case 'nombre':
          comparison = (a.nombre || '').localeCompare(b.nombre || '')
          break
        case 'semanas':
          comparison = a.semanasConFaltantes - b.semanasConFaltantes
          break
        default:
          comparison = a.promedioSemanal - b.promedioSemanal
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [productos, sortBy, sortOrder])

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <ArrowUpDown size={14} className="opacity-40" />
    return sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Rotación de Productos</h1>
        <p className="text-gray-600 mt-1">
          Promedio semanal de faltantes por producto
        </p>
      </div>

      {/* Filtros compactos */}
      <div className="card bg-indigo-50 border-indigo-200 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="label text-indigo-800 text-xs">Semanas a analizar</label>
            <select
              value={config.semanas}
              onChange={(e) => setConfig({ semanas: Number(e.target.value) })}
              className="input"
              disabled={loading}
            >
              {SEMANA_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} semanas
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="label text-indigo-800 text-xs">Productos a mostrar</label>
            <select
              value={config.limite}
              onChange={(e) => setConfig({ limite: Number(e.target.value) })}
              className="input"
              disabled={loading}
            >
              {LIMITE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  Top {option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={reload}
              className="btn btn-primary"
              disabled={loading}
            >
              <RefreshCw size={16} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>
      </div>

      {/* Tarjetas de resumen */}
      {resumen && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {/* Promedio Semanal General - DESTACADO */}
          <div className="card bg-gradient-to-br from-indigo-500 to-indigo-600 text-white lg:col-span-2">
            <p className="text-sm opacity-90 mb-1">Promedio Semanal General</p>
            <p className="text-4xl font-bold">{promedioGeneral}</p>
            <p className="text-xs opacity-75 mt-1">unidades por semana</p>
          </div>

          <div className="card">
            <p className="text-xs text-gray-500 uppercase">Semanas</p>
            <p className="text-2xl font-semibold text-gray-900">{resumen.semanas_analizadas}</p>
          </div>

          <div className="card">
            <p className="text-xs text-gray-500 uppercase">Productos</p>
            <p className="text-2xl font-semibold text-gray-900">{resumen.productos_analizados}</p>
          </div>

          <div className="card">
            <p className="text-xs text-gray-500 uppercase">Total Faltantes</p>
            <p className="text-2xl font-semibold text-gray-900">{formatNumber(resumen.total_unidades)}</p>
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
            No hay productos con registros para las semanas seleccionadas.
          </p>
        </div>
      )}

      {!loading && !error && productos.length > 0 && (
        <div className="card">
          <div className="mb-4">
            <h3 className="text-xl font-semibold text-gray-900">Detalle por Producto</h3>
            <p className="text-sm text-gray-600">Haz clic en los encabezados para ordenar</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th
                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('nombre')}
                  >
                    <div className="flex items-center gap-2">
                      Producto
                      <SortIcon column="nombre" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('promedio')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Promedio/Semana
                      <SortIcon column="promedio" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('total')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Total Faltantes
                      <SortIcon column="total" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('semanas')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Frecuencia
                      <SortIcon column="semanas" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Historial Semanal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {productosConDatos.map((producto) => {
                  const maxCantidad = Math.max(...producto.historial.map((h) => h.cantidad), 0) || 1
                  const frecuenciaPorcentaje = Math.round((producto.semanasConFaltantes / producto.numSemanas) * 100)

                  return (
                    <tr key={producto.codigo} className="hover:bg-gray-50">
                      {/* Producto */}
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">{producto.nombre}</p>
                          <p className="text-xs text-gray-500">
                            {producto.codigo} • {producto.proveedor_nombre || 'Sin proveedor'}
                          </p>
                        </div>
                      </td>

                      {/* Promedio Semanal - DESTACADO */}
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-100">
                          <span className="text-2xl font-bold text-indigo-700">
                            {producto.promedioSemanal}
                          </span>
                          <span className="text-xs text-indigo-600 ml-1">und</span>
                        </div>
                      </td>

                      {/* Total Faltantes */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-lg font-semibold text-gray-900">
                          {formatNumber(producto.cantidad_total)}
                        </span>
                      </td>

                      {/* Frecuencia */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-sm font-medium text-gray-900">
                            {frecuenciaPorcentaje}%
                          </span>
                          <span className="text-xs text-gray-500">
                            {producto.semanasConFaltantes}/{producto.numSemanas} sem
                          </span>
                        </div>
                      </td>

                      {/* Historial Visual */}
                      <td className="px-4 py-3">
                        <div className="flex gap-1 h-16 items-end min-w-[200px]">
                          {producto.historial.map((semana, idx) => {
                            const height = (semana.cantidad / maxCantidad) * 100
                            return (
                              <div
                                key={`${producto.codigo}-${semana.semana}-${semana.ano}`}
                                className="flex flex-col items-center flex-1 min-w-[8px]"
                              >
                                <div
                                  className="w-full rounded-t bg-indigo-400 hover:bg-indigo-500 transition-colors"
                                  style={{ height: `${height}%`, minHeight: semana.cantidad > 0 ? '4px' : '0' }}
                                  title={`Sem ${semana.semana}/${semana.ano}: ${formatNumber(semana.cantidad)} und`}
                                />
                                {idx % 2 === 0 && (
                                  <span className="text-[9px] text-gray-400 mt-0.5">{semana.semana}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Info adicional */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              💡 <strong>Promedio/Semana:</strong> Cantidad promedio de faltantes por semana.
              <strong className="ml-2">Frecuencia:</strong> Porcentaje de semanas donde hubo faltantes.
              <strong className="ml-2">Historial:</strong> Visualización semanal, pasa el cursor para ver detalles.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
