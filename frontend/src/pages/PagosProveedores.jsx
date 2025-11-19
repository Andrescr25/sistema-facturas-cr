import { useMemo, useState } from 'react'
import { usePagosProveedores } from '../hooks/usePagosProveedores'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  Search,
  Shield,
  X
} from 'lucide-react'

const estadoOptions = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'vencida', label: 'Vencidas' },
  { value: 'parcial', label: 'En seguimiento' },
  { value: 'pagada', label: 'Pagadas' }
]

const diasOptions = [
  { value: 'todos', label: 'Cualquier fecha' },
  { value: 'vence7', label: 'Vence en 7 días' },
  { value: 'vence15', label: 'Vence en 15 días' },
  { value: 'vence30', label: 'Vence en 30 días' },
  { value: 'vencidas', label: 'Solo vencidas' }
]

const estadoStyles = {
  PENDIENTE: 'bg-yellow-100 text-yellow-800',
  PARCIAL: 'bg-blue-100 text-blue-800',
  PAGADA: 'bg-green-100 text-green-800',
  VENCIDA: 'bg-red-100 text-red-800'
}

const formatCurrency = (value) =>
  `₡${(Number(value) || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}`

const formatDate = (value) =>
  new Date(value).toLocaleDateString('es-CR', { year: 'numeric', month: 'short', day: 'numeric' })

const diasLabel = (dias) => {
  if (dias === 0) return 'Vence hoy'
  if (dias > 0) return `Vence en ${dias} día${dias === 1 ? '' : 's'}`
  const abs = Math.abs(dias)
  return `Vencida hace ${abs} día${abs === 1 ? '' : 's'}`
}

export default function PagosProveedores() {
  const {
    cuentas,
    resumen,
    loading,
    error,
    filters,
    setFilters,
    proveedoresDisponibles,
    actualizarEstado,
    reload
  } = usePagosProveedores()
  const [expanded, setExpanded] = useState(new Set())

  const handleToggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const proveedoresOptions = useMemo(() => [
    { value: 'todos', label: 'Todos los proveedores' },
    ...proveedoresDisponibles.map((prov) => ({
      value: prov.cedula,
      label: `${prov.nombre} (${prov.cedula})`
    }))
  ], [proveedoresDisponibles])

  const quickActions = [
    { label: 'Pendientes', value: 'pendiente' },
    { label: 'Vencidas', value: 'vencida' },
    { label: 'En seguimiento', value: 'parcial' },
    { label: 'Pagadas', value: 'pagada' }
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pagos a Proveedores</h1>
          <p className="text-gray-600 mt-1">
            Controla las facturas recibidas, sus fechas de vencimiento y el saldo pendiente a pagar.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn btn-outline flex items-center gap-2"
            onClick={reload}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {resumen && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="card">
            <p className="text-sm text-gray-500">Total pendiente</p>
            <p className="text-2xl font-semibold text-gray-900">{formatCurrency(resumen.totalPendiente)}</p>
            <span className="text-xs text-gray-500">{resumen.totalFacturas} facturas abiertas</span>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <AlertTriangle size={14} className="text-red-500" />
              Vencidas
            </p>
            <p className="text-2xl font-semibold text-red-600">{formatCurrency(resumen.totalVencidas)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <Clock size={14} className="text-orange-500" />
              Próximos 7 días
            </p>
            <p className="text-2xl font-semibold text-orange-600">
              {formatCurrency(resumen.proximasAVencer?.monto || 0)}
            </p>
            <span className="text-xs text-gray-500">
              {resumen.proximasAVencer?.cantidad || 0} facturas
            </span>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <Shield size={14} className="text-green-500" />
              Proveedores activos
            </p>
            <p className="text-2xl font-semibold text-gray-900">{resumen.totalProveedores}</p>
          </div>
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex items-center gap-2 text-gray-600">
          <Filter size={16} />
          <span className="font-medium text-sm">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select
            className="input"
            value={filters.estado}
            onChange={(e) => setFilters((prev) => ({ ...prev, estado: e.target.value }))}
          >
            {estadoOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.dias}
            onChange={(e) => setFilters((prev) => ({ ...prev, dias: e.target.value }))}
          >
            {diasOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.proveedor}
            onChange={(e) => setFilters((prev) => ({ ...prev, proveedor: e.target.value }))}
          >
            {proveedoresOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="input pl-9"
              placeholder="Buscar proveedor o factura..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <button
              key={action.value}
              className={`px-3 py-1 rounded-full text-sm border transition ${
                filters.estado === action.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600 hover:border-blue-400'
              }`}
              onClick={() => setFilters((prev) => ({ ...prev, estado: action.value }))}
            >
              {action.label}
            </button>
          ))}
          <button
            className="px-3 py-1 rounded-full text-sm border border-gray-300 text-gray-600 hover:border-red-400"
            onClick={() => setFilters({ ...defaultFilters })}
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {loading && (
        <div className="card text-center py-12">
          <RefreshCw size={28} className="mx-auto animate-spin text-blue-500 mb-3" />
          <p className="text-gray-600">Cargando información de pagos...</p>
        </div>
      )}

      {error && (
        <div className="card bg-red-50 border-red-200 text-red-700">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && cuentas.length === 0 && (
        <div className="card text-center py-12">
          <CheckCircle2 size={36} className="mx-auto text-green-500 mb-3" />
          <p className="text-gray-700 font-medium">No hay facturas que coincidan con los filtros.</p>
        </div>
      )}

      <div className="space-y-4">
        {cuentas.map((cuenta) => {
          const estadoBadge = estadoStyles[cuenta.estado] || 'bg-gray-100 text-gray-800'
          const dias = cuenta.diasRestantes
          const isExpanded = expanded.has(cuenta.id)

          return (
            <div key={cuenta.id} className="card border border-gray-100 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-gray-900">{cuenta.proveedorNombre}</p>
                  <p className="text-sm text-gray-500">{cuenta.proveedorCedula}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                    <span>Factura #{cuenta.numeroConsecutivo}</span>
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      Emisión: {formatDate(cuenta.fechaEmision)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      Vencimiento: {formatDate(cuenta.fechaVencimiento)}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        dias < 0 ? 'bg-red-100 text-red-700' : dias <= 7 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {diasLabel(dias)}
                    </span>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <p className="text-sm text-gray-500">Saldo pendiente</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(cuenta.saldoPendiente)}
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${estadoBadge}`}>
                      {cuenta.estado}
                    </span>
                    <button
                      onClick={() => handleToggleExpand(cuenta.id)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      {isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="space-x-2">
                  <button
                    className="btn btn-outline text-sm"
                    onClick={() => actualizarEstado(cuenta.id, { estado: 'PAGADA', saldoPendiente: 0 })}
                    disabled={cuenta.estado === 'PAGADA'}
                  >
                    Marcar como pagada
                  </button>
                  {(cuenta.estado === 'PAGADA' || cuenta.estado === 'VENCIDA') && (
                    <button
                      className="btn btn-outline text-sm"
                      onClick={() => actualizarEstado(cuenta.id, { estado: 'PENDIENTE', saldoPendiente: cuenta.montoTotal })}
                    >
                      Revertir a pendiente
                    </button>
                  )}
                </div>
                {cuenta.estado !== 'PAGADA' && (
                  <p className="text-xs text-gray-500">
                    Condición: {cuenta.condicionVenta === '02' ? 'Crédito' : 'Contado'} • Plazo: {cuenta.plazoCredito} días
                  </p>
                )}
              </div>

              {isExpanded && (
                <div className="mt-4 border-t pt-4 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700">Productos incluidos</h4>
                  {cuenta.productos.length === 0 && (
                    <p className="text-sm text-gray-500">Sin detalle de productos.</p>
                  )}
                  {cuenta.productos.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="py-2 pr-4">Descripción</th>
                            <th className="py-2 pr-4">Código</th>
                            <th className="py-2 pr-4 text-right">Cantidad</th>
                            <th className="py-2 pr-4 text-right">Precio</th>
                            <th className="py-2 pr-4 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {cuenta.productos.map((producto) => (
                            <tr key={producto.id} className="text-gray-700">
                              <td className="py-2 pr-4">{producto.descripcion}</td>
                              <td className="py-2 pr-4 text-xs text-gray-500">{producto.codigoProveedor}</td>
                              <td className="py-2 pr-4 text-right">{producto.cantidad}</td>
                              <td className="py-2 pr-4 text-right">{formatCurrency(producto.precioUnitario)}</td>
                              <td className="py-2 pr-4 text-right">{formatCurrency(producto.totalLinea)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

