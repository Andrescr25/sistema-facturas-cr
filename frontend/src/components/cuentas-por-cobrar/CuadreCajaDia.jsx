import { CalendarDays, Banknote, ArrowRightLeft, CreditCard, Loader2, RefreshCw, Receipt } from 'lucide-react'
import { useCuadreCaja } from '../../hooks/useCuadreCaja'
import { formatCurrency, formatDate, METODOS_PAGO } from '../../utils/cuentasPorCobrarUtils'

/**
 * Configuración visual de cada método de pago: ícono, colores y etiqueta
 * para las tarjetas de resumen y los badges en la lista de cobros.
 */
const METODO_CONFIG = {
  cash: {
    label: 'Efectivo',
    icon: Banknote,
    bg: 'bg-exito-50',
    border: 'border-exito-100',
    textLabel: 'text-exito-600',
    textMonto: 'text-exito-900',
    badge: 'bg-exito-100 text-exito-800'
  },
  transfer: {
    label: 'Transferencia / SINPE',
    icon: ArrowRightLeft,
    bg: 'bg-primario-50',
    border: 'border-primario-100',
    textLabel: 'text-primario-600',
    textMonto: 'text-primario-900',
    badge: 'bg-primario-100 text-primario-800'
  },
  'credit-card': {
    label: 'Tarjeta de Crédito',
    icon: CreditCard,
    bg: 'bg-nota-50',
    border: 'border-nota-100',
    textLabel: 'text-nota-600',
    textMonto: 'text-nota-900',
    badge: 'bg-nota-100 text-nota-800'
  },
  'debit-card': {
    label: 'Tarjeta de Débito',
    icon: CreditCard,
    bg: 'bg-primario-50',
    border: 'border-primario-100',
    textLabel: 'text-primario-600',
    textMonto: 'text-primario-900',
    badge: 'bg-primario-100 text-primario-800'
  },
  check: {
    label: 'Cheque',
    icon: Receipt,
    bg: 'bg-alerta-50',
    border: 'border-alerta-100',
    textLabel: 'text-alerta-600',
    textMonto: 'text-alerta-900',
    badge: 'bg-alerta-100 text-alerta-800'
  }
}

const METODO_DEFAULT = {
  label: 'Otro',
  icon: Receipt,
  bg: 'bg-neutro-50',
  border: 'border-neutro-100',
  textLabel: 'text-neutro-600',
  textMonto: 'text-neutro-900',
  badge: 'bg-neutro-100 text-neutro-800'
}

function getMetodoConfig(metodoId) {
  return METODO_CONFIG[metodoId] || METODO_DEFAULT
}

function getMetodoLabel(metodoId) {
  return METODOS_PAGO.find(m => m.id === metodoId)?.label || metodoId
}

/**
 * Pestaña "Cobros del día" dentro de Cuentas por Cobrar.
 * Permite seleccionar una fecha y ver:
 *  - Tarjetas de resumen por método de pago (cuánto efectivo, cuánto SINPE, etc.)
 *  - Lista detallada de cada cobro individual
 */
export default function CuadreCajaDia() {
  const {
    fecha,
    cobros,
    resumen,
    loading,
    error,
    cambiarFecha,
    irAHoy,
    irAyer,
    recargar
  } = useCuadreCaja()

  const hoy = new Date().toISOString().slice(0, 10)
  const esHoy = fecha === hoy

  // Obtener las categorías de método que tienen al menos un cobro
  const metodosConCobros = resumen?.porMetodo ? Object.keys(resumen.porMetodo) : []
  // Orden fijo para las tarjetas
  const ordenMetodos = ['cash', 'transfer', 'credit-card', 'debit-card', 'check']
  const metodosOrdenados = ordenMetodos.filter(m => metodosConCobros.includes(m))
  // Agregar cualquier método no listado al final
  const metodosExtra = metodosConCobros.filter(m => !ordenMetodos.includes(m))
  const todosMetodos = [...metodosOrdenados, ...metodosExtra]

  return (
    <div className="space-y-6">

      {/* ── Selector de fecha ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={20} className="text-neutro-400" />
          <input
            type="date"
            value={fecha}
            onChange={(e) => cambiarFecha(e.target.value)}
            max={hoy}
            className="input h-11 text-base font-medium"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={irAHoy}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              esHoy
                ? 'bg-primario-600 text-white shadow-md'
                : 'bg-neutro-100 text-neutro-700 hover:bg-neutro-200'
            }`}
          >
            Hoy
          </button>
          <button
            onClick={irAyer}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              fecha === new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().slice(0, 10)
                ? 'bg-primario-600 text-white shadow-md'
                : 'bg-neutro-100 text-neutro-700 hover:bg-neutro-200'
            }`}
          >
            Ayer
          </button>
          <button
            onClick={recargar}
            disabled={loading}
            className="p-2.5 rounded-xl bg-neutro-100 text-neutro-600 hover:bg-neutro-200 transition-all disabled:opacity-50"
            title="Recargar"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="card bg-peligro-50 border-peligro-200 text-peligro-700">
          <p>{error}</p>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-12 text-neutro-400">
          <Loader2 size={24} className="animate-spin" />
          <p className="text-base">Cargando cobros…</p>
        </div>
      )}

      {/* ── Sin cobros ── */}
      {!loading && !error && cobros.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-neutro-100 flex items-center justify-center mx-auto mb-4">
            <Receipt size={28} className="text-neutro-400" />
          </div>
          <h3 className="text-lg font-bold text-neutro-700 mb-1">Sin cobros este día</h3>
          <p className="text-neutro-500 text-sm max-w-xs mx-auto">
            No hay abonos registrados para el {formatDate(fecha + 'T12:00:00')}. Seleccioná otra fecha o registrá un abono en la pestaña "Pendientes".
          </p>
        </div>
      )}

      {/* ── Contenido con datos ── */}
      {!loading && !error && cobros.length > 0 && resumen && (
        <>
          {/* Tarjeta del total general */}
          <div className="bg-gradient-to-br from-neutro-900 to-neutro-800 rounded-2xl p-5 text-white">
            <p className="text-sm text-neutro-300 font-medium mb-1">Total cobrado</p>
            <p className="text-3xl sm:text-4xl font-extrabold">{formatCurrency(resumen.total)}</p>
            <p className="text-sm text-neutro-400 mt-1">
              {resumen.cantidadCobros} {resumen.cantidadCobros === 1 ? 'cobro' : 'cobros'} el {formatDate(fecha + 'T12:00:00')}
            </p>
          </div>

          {/* Tarjetas por método de pago */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {todosMetodos.map(metodoId => {
              const config = getMetodoConfig(metodoId)
              const datos = resumen.porMetodo[metodoId]
              const Icon = config.icon
              return (
                <div
                  key={metodoId}
                  className={`${config.bg} ${config.border} border rounded-2xl p-4`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={18} className={config.textLabel} />
                    <p className={`text-sm font-semibold ${config.textLabel}`}>{config.label}</p>
                  </div>
                  <p className={`text-xl font-extrabold ${config.textMonto}`}>
                    {formatCurrency(datos.monto)}
                  </p>
                  <p className="text-xs text-neutro-500 mt-0.5">
                    {datos.cantidad} {datos.cantidad === 1 ? 'cobro' : 'cobros'}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Lista detallada de cobros */}
          <div>
            <h3 className="text-sm font-semibold text-neutro-600 mb-3">Detalle de cobros</h3>
            <div className="divide-y divide-neutro-100 border border-neutro-100 rounded-2xl overflow-hidden bg-white">
              {cobros.map((cobro) => {
                const config = getMetodoConfig(cobro.metodoPago)
                const Icon = config.icon
                return (
                  <div key={cobro.id} className="px-4 py-3.5 flex items-center gap-3">
                    <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${config.bg}`}>
                      <Icon size={18} className={config.textLabel} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-base font-bold text-neutro-900 truncate">
                          {cobro.clienteNombre || 'Sin nombre'}
                        </p>
                        <p className="text-base font-bold text-neutro-900 shrink-0">
                          {formatCurrency(Number(cobro.monto))}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-neutro-500">
                          Factura #{cobro.numeroFactura}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.badge}`}>
                          {getMetodoLabel(cobro.metodoPago)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
