import { ArrowDownLeft, ArrowUpRight, Loader2, RefreshCw, Scale, Wallet } from 'lucide-react'
import { useCajaGeneral } from '../../hooks/useCajaGeneral'
import { formatCurrency, formatDate } from '../../utils/pagos'

/**
 * Caja General: el punto central por donde pasa la plata (decisión del
 * usuario, 2026-09-23). Cada cobro a un cliente ENTRA; cada pago a un
 * proveedor o de un gasto SALE. Cada movimiento dice qué facturas lo
 * originaron, y los anulados se ven tachados pero no suman.
 *
 * POR PERÍODO Y NO UN SALDO DE SIEMPRE: los pagos a proveedores de antes se
 * marcaban "pagada" a mano, sin movimiento, así que un saldo acumulado desde
 * el principio sumaría todo lo cobrado y nada de lo pagado.
 */
const TIPO = {
  cobro: 'Cobro a',
  pago_proveedor: 'Pago a',
  gasto: 'Gasto:'
}

export default function MovimientosCaja() {
  const { hoy, inicioMes, desde, setDesde, hasta, setHasta, sentido, setSentido,
    datos, cargando, error, cargar, movimientos } = useCajaGeneral()
  const t = datos?.totales

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-neutro-400">
          Desde
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="input mt-1 block h-11 text-base" />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wider text-neutro-400">
          Hasta
          <input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} className="input mt-1 block h-11 text-base" />
        </label>
        <button type="button" onClick={() => { setDesde(hoy); setHasta(hoy) }} className="btn btn-outline h-11">Hoy</button>
        <button type="button" onClick={() => { setDesde(inicioMes); setHasta(hoy) }} className="btn btn-outline h-11">Este mes</button>
        <button type="button" onClick={cargar} title="Volver a cargar" className="btn btn-outline h-11"><RefreshCw size={16} /></button>
      </div>

      {t && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-neutro-100 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-sm text-neutro-500"><ArrowDownLeft size={16} className="text-exito-600" /> Entró</p>
            <p className="text-2xl font-bold text-exito-700">{formatCurrency(t.entradas)}</p>
          </div>
          <div className="rounded-xl border border-neutro-100 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-sm text-neutro-500"><ArrowUpRight size={16} className="text-peligro-600" /> Salió</p>
            <p className="text-2xl font-bold text-peligro-700">{formatCurrency(t.salidas)}</p>
          </div>
          <div className="rounded-xl border border-neutro-100 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-sm text-neutro-500"><Scale size={16} className="text-neutro-500" /> Neto del período</p>
            <p className={`text-2xl font-bold ${t.neto < 0 ? 'text-peligro-700' : 'text-neutro-900'}`}>{formatCurrency(t.neto)}</p>
          </div>
        </div>
      )}

      {datos?.porMetodo?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {datos.porMetodo.map((m) => (
            <span key={m.clave} className="rounded-full bg-neutro-100 px-3 py-1 text-sm text-neutro-700">
              <strong>{m.metodo}</strong>
              {m.entradas > 0 && <span className="text-exito-700"> +{formatCurrency(m.entradas)}</span>}
              {m.salidas > 0 && <span className="text-peligro-700"> −{formatCurrency(m.salidas)}</span>}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {[['todos', 'Todo'], ['entrada', 'Entradas'], ['salida', 'Salidas']].map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setSentido(valor)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${sentido === valor ? 'bg-neutro-900 text-white' : 'bg-white text-neutro-600 ring-1 ring-neutro-200'}`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-neutro-500"><Loader2 className="animate-spin" size={20} /> Cargando movimientos…</div>
      ) : error ? (
        <p className="rounded-xl bg-peligro-50 p-4 text-peligro-700">{error}</p>
      ) : movimientos.length === 0 ? (
        <div className="rounded-xl border border-neutro-100 bg-white py-14 text-center text-neutro-500">
          <Wallet size={36} className="mx-auto mb-2 text-neutro-300" />
          No hay movimientos en este período.
        </div>
      ) : (
        <div className="divide-y divide-neutro-100 overflow-hidden rounded-xl border border-neutro-100 bg-white shadow-sm">
          {movimientos.map((m) => {
            const entra = m.sentido === 'entrada'
            return (
              <div key={`${m.tipo}-${m.id}`} className={`flex items-start gap-3 px-4 py-3 ${m.anulado ? 'bg-neutro-50' : ''}`}>
                <div className={`mt-0.5 rounded-lg p-2 ${entra ? 'bg-exito-50 text-exito-600' : 'bg-peligro-50 text-peligro-600'}`}>
                  {entra ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-neutro-900">{TIPO[m.tipo] || ''} {m.contraparte}</p>
                  <p className="text-sm text-neutro-500">
                    {formatDate(m.fecha)} · {m.metodo || '—'}{m.referencia ? ` · Ref. ${m.referencia}` : ''}
                  </p>
                  {m.facturas && <p className="text-xs text-neutro-500">Facturas: {m.facturas}</p>}
                  {m.anulado && <p className="text-sm text-peligro-600">Anulado{m.motivoAnulacion ? `: ${m.motivoAnulacion}` : ''} — no suma</p>}
                </div>
                <p className={`shrink-0 text-base font-bold ${m.anulado ? 'text-neutro-400 line-through' : entra ? 'text-exito-700' : 'text-peligro-700'}`}>
                  {entra ? '+' : '−'}{formatCurrency(m.monto)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
