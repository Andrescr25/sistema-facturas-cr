import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, CreditCard, Loader2, Wallet } from 'lucide-react'
import HojaModal from './HojaModal'
import { formatCurrency } from '../../utils/pagos'
import { getOpcionesPago } from '../../services/configuracionService'
import { hoyEnCostaRica } from '../../utils/fechaCR'

/**
 * Cobrar o pagar VARIAS facturas de la misma contraparte en un solo
 * movimiento de Caja General: "este pago al proveedor X cubre las facturas A,
 * B y C". Lo usan Cuentas por Cobrar (entra) y Pagos a Proveedores (sale).
 *
 * Cada factura viene con su saldo entero cargado —el caso normal es saldarlas—
 * y se puede bajar a un abono. Una factura cuyo monto quedó igual a su saldo
 * se manda como "todo": el servidor relee el saldo CON BLOQUEO y cobra/paga
 * ese, así no queda un resto de céntimos si alguien la tocó mientras tanto.
 *
 * @param {'entrada'|'salida'} sentido
 * @param {Array<{id, numero, saldo}>} facturas
 * @param {(datos: {lineas: Array<{id, monto, todo}>, metodoPagoId, referencia, fecha}) => Promise<boolean>} onRegistrar
 */
export default function ModalPagoVarias({ sentido, titulo, facturas, procesando, onRegistrar, onCerrar }) {
  const entra = sentido === 'entrada'
  const [montos, setMontos] = useState(() => Object.fromEntries(facturas.map((f) => [f.id, String(f.saldo)])))
  const [metodos, setMetodos] = useState([])
  const [metodoPagoId, setMetodoPagoId] = useState(null)
  const [referencia, setReferencia] = useState('')
  // El día en Costa Rica, no en UTC: después de las 6 p.m. eso ya es mañana.
  const [fecha, setFecha] = useState(hoyEnCostaRica())

  useEffect(() => {
    let cancelado = false
    getOpcionesPago().then(({ metodos }) => { if (!cancelado) setMetodos(metodos) }).catch(() => {})
    return () => { cancelado = true }
  }, [])

  const lineas = useMemo(() => facturas.map((f) => {
    const monto = Number(montos[f.id])
    const valido = Number.isFinite(monto) && monto > 0 && monto <= f.saldo + 0.001
    return { id: f.id, numero: f.numero, saldo: f.saldo, monto, valido, todo: valido && Math.abs(monto - f.saldo) < 0.005 }
  }), [facturas, montos])

  const total = lineas.reduce((s, l) => s + (l.valido ? l.monto : 0), 0)
  const invalidas = lineas.filter((l) => !l.valido)
  const metodo = metodos.find((m) => m.id === metodoPagoId) || null
  const faltaReferencia = Boolean(metodo?.pideReferencia) && !referencia.trim()
  const listo = invalidas.length === 0 && metodoPagoId && !faltaReferencia && total > 0

  const registrar = async () => {
    if (!listo) return
    const exito = await onRegistrar({
      lineas: lineas.map((l) => ({ id: l.id, monto: l.monto, todo: l.todo })),
      metodoPagoId,
      referencia: referencia.trim() || null,
      fecha
    })
    if (exito) onCerrar()
  }

  return (
    <HojaModal
      titulo={titulo}
      subtitulo={`${entra ? 'Cobrar' : 'Pagar'} ${facturas.length} factura${facturas.length === 1 ? '' : 's'} en un solo movimiento`}
      ancho="sm:max-w-2xl"
      onCerrar={onCerrar}
    >
      <div className="overflow-hidden rounded-xl border border-neutro-100">
        {lineas.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-neutro-100 px-4 py-3 last:border-b-0">
            <div className="min-w-0">
              <p className="font-bold text-neutro-900">#{l.numero}</p>
              <p className="text-sm text-neutro-500">Saldo {formatCurrency(l.saldo)}</p>
            </div>
            <div className="text-right">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-neutro-400">₡</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={l.saldo}
                  step="0.01"
                  value={montos[l.id]}
                  onChange={(e) => setMontos((m) => ({ ...m, [l.id]: e.target.value }))}
                  aria-label={`Monto de la factura ${l.numero}`}
                  className={`input h-11 w-40 pl-7 text-right text-base font-bold ${l.valido ? '' : 'border-peligro-300'}`}
                />
              </div>
              <p className={`mt-1 text-xs ${l.valido ? 'text-neutro-400' : 'text-peligro-600'}`}>
                {!l.valido ? 'Mayor a ₡0 y sin pasar el saldo' : l.todo ? 'Queda saldada' : `Queda debiendo ${formatCurrency(l.saldo - l.monto)}`}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-xl bg-neutro-50 px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-neutro-600">
          <Wallet size={16} className="text-neutro-400" />
          {entra ? 'Entra a' : 'Sale de'} <strong className="font-semibold text-neutro-800">Caja General</strong>
        </span>
        <span className="text-xl font-extrabold text-neutro-900">{formatCurrency(total)}</span>
      </div>

      <div className="space-y-4 rounded-2xl border border-neutro-100 bg-neutro-50 p-4">
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutro-700">
            <CreditCard size={16} className="text-neutro-400" />
            ¿Cómo se {entra ? 'cobró' : 'pagó'}?
          </label>
          <select
            value={metodoPagoId ?? ''}
            onChange={(e) => { setMetodoPagoId(Number(e.target.value)); setReferencia('') }}
            className="input h-12 w-full text-base"
          >
            <option value="" disabled>Elegí el método…</option>
            {metodos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          {metodo?.pideReferencia && (
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder={`Referencia del ${metodo.nombre.toLowerCase()}…`}
              maxLength={60}
              className="input mt-2 h-12 w-full text-base"
            />
          )}
        </div>
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutro-700">
            <CalendarDays size={16} className="text-neutro-400" />
            Fecha
          </label>
          <input type="date" value={fecha} max={hoyEnCostaRica()} onChange={(e) => setFecha(e.target.value)} className="input h-12 w-full text-base" />
        </div>
      </div>

      <button
        onClick={registrar}
        disabled={procesando || !listo}
        className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-exito-600 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-exito-700 disabled:opacity-40"
      >
        {procesando ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
        {procesando ? 'Guardando…' : `${entra ? 'Cobrar' : 'Pagar'} ${formatCurrency(total)}`}
      </button>
    </HojaModal>
  )
}
