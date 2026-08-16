import { useState } from 'react'
import { Check, Undo2, Loader2, CalendarX, Receipt } from 'lucide-react'
import { formatCurrency, formatFecha, formatFechaHora, categoriaInfo, quincenaLabel } from '../../utils/pagosRecurrentesUtils'

/**
 * Los pagos que caen en el mes. Cada fila pendiente trae su propio campo de
 * monto ya cargado con el estimado: el caso normal es que la luz llegue por
 * un monto distinto al presupuestado, así que se corrige y se marca pagado
 * en un solo gesto, sin abrir nada.
 */
function FilaPago({ pago, onPagar, onRevertir }) {
  // Vacío (no '0') mientras se espera la consulta, para que se vea el
  // placeholder '—' en vez de un cero que parece un monto real.
  const [monto, setMonto] = useState(pago.esperandoConsulta ? '' : String(pago.monto ?? ''))
  const [guardando, setGuardando] = useState(false)
  const info = categoriaInfo(pago.categoria)
  const quincena = quincenaLabel(pago.periodo)

  const pagar = async () => {
    setGuardando(true)
    try {
      await onPagar(pago, monto)
    } finally {
      setGuardando(false)
    }
  }

  const pagado = pago.estado === 'pagado'

  return (
    <div className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
      pago.vencido ? 'bg-red-50/40' : pagado ? 'bg-green-50/20' : ''
    }`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-gray-900 text-sm">{pago.nombre}</p>
          {quincena && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">{quincena}</span>
          )}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${info.estilo}`}>{info.label}</span>
          {pago.vencido && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-red-100 text-red-700 flex items-center gap-1">
              <CalendarX size={10} /> Vencido
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {pago.proveedor && <>{pago.proveedor} · </>}
          Vence {formatFecha(pago.fechaVencimiento)}
          {pagado && <> · pagado {formatFecha(pago.fechaPago)}</>}
        </p>
        {/* Trazabilidad del recibo traído por la consulta automática: sin
            esto el monto aparece "por arte de magia" y no hay forma de
            cotejarlo contra el papel. */}
        {pago.notas && (
          <p className="text-[11px] text-blue-600 mt-0.5">{pago.notas}</p>
        )}
        {/* Sin esto el gasto aparecía en ₡0, que se lee como "no debo nada"
            cuando en realidad todavía no se consultó el recibo. Se distingue
            "nunca se consultó" de "se consultó y el proveedor todavía no
            publicó el recibo": son dos situaciones distintas y la segunda no
            requiere hacer nada. */}
        {pago.esperandoConsulta && (
          <p className="text-[11px] text-amber-600 mt-0.5">
            {pago.ultimaConsulta
              ? `Sin recibo nuevo · consultado ${formatFechaHora(pago.ultimaConsulta)}`
              : 'Pendiente de consulta'}
          </p>
        )}
      </div>

      {pagado ? (
        <div className="flex items-center gap-3 shrink-0">
          <p className="font-bold text-gray-900">{formatCurrency(pago.monto)}</p>
          <button
            onClick={() => onRevertir(pago)}
            title="Marcar como pendiente"
            className="text-xs text-gray-400 hover:text-gray-700 font-semibold flex items-center gap-1"
          >
            <Undo2 size={13} /> Deshacer
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">₡</span>
            <input
              type="number"
              min="0"
              step="100"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder={pago.esperandoConsulta ? '—' : '0'}
              className={`w-32 text-right py-2 pl-6 pr-2 border-2 rounded-xl font-bold text-sm focus:outline-none focus:border-blue-500 ${
                pago.esperandoConsulta ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200'
              }`}
            />
          </div>
          <button
            onClick={pagar}
            disabled={guardando}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white text-sm font-bold py-2 px-4 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap"
          >
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Pagar
          </button>
        </div>
      )}
    </div>
  )
}

export default function ListaPagosMes({ pagos, loading, onPagar, onRevertir }) {
  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Pagos del mes</h3>
        {loading && <Loader2 size={16} className="animate-spin text-blue-500" />}
      </div>

      {!loading && pagos.length === 0 ? (
        <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-3">
          <Receipt size={40} className="text-gray-300" />
          <p>No hay pagos este mes. Agregá tus gastos fijos en la pestaña "Gastos fijos".</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {pagos.map(p => (
            <FilaPago key={p.id} pago={p} onPagar={onPagar} onRevertir={onRevertir} />
          ))}
        </div>
      )}
    </div>
  )
}
