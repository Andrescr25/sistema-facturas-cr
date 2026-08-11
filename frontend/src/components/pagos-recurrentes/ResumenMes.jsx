import { ChevronLeft, ChevronRight, CalendarDays, Wallet, CheckCircle2, AlertTriangle, TrendingDown, RefreshCw, Loader2 } from 'lucide-react'
import { formatCurrency, periodoLabel, categoriaInfo } from '../../utils/pagosRecurrentesUtils'

/**
 * Cabecera del mes: navegación entre períodos y los cuatro números que
 * responden "¿cuánta plata sale este mes y cuánta falta?".
 *
 * El costo mensual estimado va aparte y viene del resumen global: prorratea
 * los gastos que no son mensuales (un marchamo anual pesa 1/12 por mes), así
 * que es el número comparable contra lo que entra — el total del mes solo
 * dice lo que cae en ESTE mes en particular.
 */
export default function ResumenMes({
  periodo, resumen, resumenFlujo, onAnterior, onSiguiente, onHoy,
  onSincronizar, sincronizando, hayFuentesAuto
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={onAnterior} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition" title="Mes anterior">
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <h2 className="text-lg font-bold text-gray-900 capitalize min-w-[10rem] text-center">
            {periodoLabel(periodo)}
          </h2>
          <button onClick={onSiguiente} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition" title="Mes siguiente">
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {hayFuentesAuto && (
            <button
              onClick={onSincronizar}
              disabled={sincronizando}
              title="Consulta los recibos reales en los sitios de los proveedores"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1.5 border border-blue-200 rounded-xl px-3 py-2"
            >
              {sincronizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {sincronizando ? 'Consultando...' : 'Actualizar recibos'}
            </button>
          )}
          <button
            onClick={onHoy}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
          >
            <CalendarDays size={14} /> Ir al mes actual
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card">
          <p className="text-sm text-gray-500 flex items-center gap-1.5"><Wallet size={14} /> Total del mes</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{formatCurrency(resumen?.total || 0)}</p>
          <span className="text-xs text-gray-400">{resumen?.cantidad || 0} pago(s)</span>
        </div>

        <div className="card">
          <p className="text-sm text-gray-500 flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-500" /> Pagado</p>
          <p className="text-2xl font-semibold text-green-600 mt-1">{formatCurrency(resumen?.pagado || 0)}</p>
          <span className="text-xs text-gray-400">
            {resumen?.total ? `${Math.round((resumen.pagado / resumen.total) * 100)}% del mes` : '—'}
          </span>
        </div>

        <div className="card">
          <p className="text-sm text-gray-500 flex items-center gap-1.5"><TrendingDown size={14} className="text-amber-500" /> Pendiente</p>
          <p className="text-2xl font-semibold text-amber-600 mt-1">{formatCurrency(resumen?.pendiente || 0)}</p>
          <span className="text-xs text-gray-400">{resumen?.cantidadPendiente || 0} sin pagar</span>
        </div>

        <div className={`card ${resumen?.vencido > 0 ? 'border-red-200 bg-red-50/40' : ''}`}>
          <p className="text-sm text-gray-500 flex items-center gap-1.5"><AlertTriangle size={14} className="text-red-500" /> Vencido</p>
          <p className={`text-2xl font-semibold mt-1 ${resumen?.vencido > 0 ? 'text-red-600' : 'text-gray-300'}`}>
            {formatCurrency(resumen?.vencido || 0)}
          </p>
          <span className="text-xs text-gray-400">
            {resumenFlujo ? `Fijo: ${formatCurrency(resumenFlujo.costoMensualEstimado)}/mes` : '—'}
          </span>
        </div>
      </div>

      {resumen?.porCategoria?.length > 0 && (
        <div className="card">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Por categoría</p>
          <div className="flex flex-wrap gap-2">
            {resumen.porCategoria.map(c => {
              const info = categoriaInfo(c.categoria)
              return (
                <div key={c.categoria} className={`px-3 py-1.5 rounded-xl text-xs ${info.estilo}`}>
                  <span className="font-bold">{info.label}</span>{' '}
                  <span className="font-semibold">{formatCurrency(c.total)}</span>
                  {c.pendiente > 0 && <span className="opacity-70"> · falta {formatCurrency(c.pendiente)}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
