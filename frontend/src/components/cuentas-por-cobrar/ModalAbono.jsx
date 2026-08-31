import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, X, Wallet, CalendarDays, CreditCard, Clock, CircleDollarSign, ChevronDown } from 'lucide-react'
import { formatCurrency, formatDate, diasLabel, METODOS_PAGO } from '../../utils/cuentasPorCobrarUtils'

/**
 * Modal de una factura con saldo: monto/fecha/método del abono + historial
 * de abonos ya registrados. Rediseñado para máxima claridad en móvil.
 *
 * Flujo simple de 2 opciones:
 *   1. Pagar todo el saldo → botón verde grande
 *   2. Abonar otro monto  → formulario con campos grandes
 */
export default function ModalAbono({ factura, clienteNombre, procesando, onRegistrar, onCargarAbonos, onCerrar }) {
  const [monto, setMonto] = useState('')
  // Saldar total no manda un monto: el backend usa el saldo que Alegra
  // reporte al momento de aplicar el pago, así no falla si el espejo local
  // quedó viejo ni deja un resto de céntimos.
  const [saldarTotal, setSaldarTotal] = useState(false)
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [metodoPago, setMetodoPago] = useState('cash')
  const [abonos, setAbonos] = useState([])
  const [loadingAbonos, setLoadingAbonos] = useState(true)
  const [mostrarFormaParcial, setMostrarFormaParcial] = useState(false)

  useEffect(() => {
    let cancelado = false
    setLoadingAbonos(true)
    onCargarAbonos(factura.alegraInvoiceId).then((data) => {
      if (!cancelado) {
        setAbonos(data)
        setLoadingAbonos(false)
      }
    })
    return () => { cancelado = true }
  }, [factura.alegraInvoiceId, onCargarAbonos])

  const montoNum = Number(monto)
  const montoInvalido = !saldarTotal && (!monto || montoNum <= 0 || montoNum > factura.saldo)

  const handleRegistrar = async () => {
    if (montoInvalido) return
    const exito = await onRegistrar({
      alegraInvoiceId: factura.alegraInvoiceId,
      numeroFactura: factura.numeroFactura,
      monto: saldarTotal ? factura.saldo : montoNum,
      fecha,
      metodoPago,
      saldarTotal
    })
    if (exito) onCerrar()
  }

  const activarSaldarTotal = () => {
    setSaldarTotal(true)
    setMonto(String(factura.saldo))
    setMostrarFormaParcial(false)
  }

  const volverAAbonoParcial = () => {
    setSaldarTotal(false)
    setMonto('')
    setMostrarFormaParcial(true)
  }

  const dias = factura.diasRestantes
  const diasColor = dias < 0 ? 'text-peligro-600' : dias <= 7 ? 'text-alerta-600' : 'text-neutro-500'
  const diasBg = dias < 0 ? 'bg-peligro-50 border-peligro-100' : dias <= 7 ? 'bg-alerta-50 border-alerta-100' : 'bg-neutro-50 border-neutro-100'

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92vh] overflow-hidden flex flex-col">

        {/* Handle para arrastrar en móvil */}
        <div className="pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1.5 bg-neutro-300 rounded-full mx-auto" />
        </div>

        {/* ─── Encabezado ─── */}
        <div className="flex justify-between items-center px-5 py-4 sm:px-6 sm:py-5 border-b border-neutro-100">
          <div className="min-w-0">
            <p className="text-[13px] text-neutro-400 font-medium">Factura #{factura.numeroFactura}</p>
            <h3 className="text-lg font-bold text-neutro-900 truncate">{clienteNombre}</h3>
          </div>
          <button
            onClick={onCerrar}
            className="ml-3 shrink-0 p-2.5 text-neutro-400 hover:text-neutro-600 rounded-xl hover:bg-neutro-100 transition-colors"
            aria-label="Cerrar"
          >
            <X size={22} />
          </button>
        </div>

        {/* ─── Contenido scrolleable ─── */}
        <div className="px-5 py-5 sm:px-6 overflow-y-auto flex-1 space-y-5">

          {/* ── 1. Resumen de la factura ── */}
          <div className="space-y-3">
            {/* Saldo pendiente — lo más importante, grande y claro */}
            <div className="bg-primario-50 border border-primario-100 rounded-2xl p-4 text-center">
              <p className="text-sm text-primario-600 font-medium mb-1">Saldo pendiente</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-primario-900">{formatCurrency(factura.saldo)}</p>
            </div>

            {/* Fecha de vencimiento */}
            <div className={`${diasBg} border rounded-xl px-4 py-3 flex items-center gap-3`}>
              <Clock size={18} className={diasColor} />
              <div>
                <p className="text-sm font-semibold text-neutro-800">
                  Vence: {formatDate(factura.fechaVencimiento)}
                </p>
                <p className={`text-xs font-medium ${diasColor}`}>{diasLabel(dias)}</p>
              </div>
            </div>
          </div>

          {/* ── 2. Opciones de pago ── */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-neutro-700">¿Cómo desea pagar?</p>

            {/* Opción A: Pagar todo */}
            <button
              onClick={activarSaldarTotal}
              disabled={procesando}
              className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                saldarTotal
                  ? 'border-exito-500 bg-exito-50 ring-2 ring-primario-200'
                  : 'border-neutro-200 bg-white hover:border-exito-300 hover:bg-exito-50/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  saldarTotal ? 'bg-exito-500 text-white' : 'bg-exito-100 text-exito-600'
                }`}>
                  <Wallet size={20} />
                </div>
                <div className="min-w-0">
                  <p className={`text-base font-bold ${saldarTotal ? 'text-exito-800' : 'text-neutro-800'}`}>
                    Pagar todo el saldo
                  </p>
                  <p className={`text-sm ${saldarTotal ? 'text-exito-600' : 'text-neutro-500'}`}>
                    {formatCurrency(factura.saldo)} — queda en ₡0
                  </p>
                </div>
                {saldarTotal && (
                  <CheckCircle2 size={22} className="shrink-0 ml-auto text-exito-500" />
                )}
              </div>
            </button>

            {/* Opción B: Abonar otro monto */}
            <button
              onClick={volverAAbonoParcial}
              disabled={procesando}
              className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                mostrarFormaParcial && !saldarTotal
                  ? 'border-primario-500 bg-primario-50 ring-2 ring-primario-200'
                  : 'border-neutro-200 bg-white hover:border-primario-300 hover:bg-primario-50/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  mostrarFormaParcial && !saldarTotal ? 'bg-primario-500 text-white' : 'bg-primario-100 text-primario-600'
                }`}>
                  <CircleDollarSign size={20} />
                </div>
                <div className="min-w-0">
                  <p className={`text-base font-bold ${mostrarFormaParcial && !saldarTotal ? 'text-primario-800' : 'text-neutro-800'}`}>
                    Abonar otro monto
                  </p>
                  <p className={`text-sm ${mostrarFormaParcial && !saldarTotal ? 'text-primario-600' : 'text-neutro-500'}`}>
                    Pagar una parte del saldo
                  </p>
                </div>
                {mostrarFormaParcial && !saldarTotal && (
                  <ChevronDown size={22} className="shrink-0 ml-auto text-primario-500" />
                )}
              </div>
            </button>

            {/* Formulario de abono parcial (solo visible cuando se selecciona) */}
            {mostrarFormaParcial && !saldarTotal && (
              <div className="bg-neutro-50 rounded-2xl p-4 space-y-4 border border-neutro-100">
                {/* Monto */}
                <div>
                  <label className="block text-sm font-semibold text-neutro-700 mb-2">
                    ¿Cuánto va a abonar?
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutro-500 font-bold text-lg">₡</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      min="0"
                      max={factura.saldo}
                      step="0.01"
                      placeholder="0,00"
                      className="input pl-10 w-full text-lg h-12"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-neutro-400 mt-1.5">
                    Máximo: {formatCurrency(factura.saldo)}
                  </p>
                  {montoInvalido && monto !== '' && (
                    <p className="text-sm text-peligro-600 mt-1.5 font-medium">
                      ⚠ El monto debe ser mayor a ₡0 y no superar el saldo.
                    </p>
                  )}
                </div>

                {/* Fecha */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-neutro-700 mb-2">
                    <CalendarDays size={16} className="text-neutro-400" />
                    Fecha del pago
                  </label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="input w-full h-12 text-base"
                  />
                </div>

                {/* Método de pago */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-neutro-700 mb-2">
                    <CreditCard size={16} className="text-neutro-400" />
                    ¿Cómo pagó?
                  </label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                    className="input w-full h-12 text-base"
                  >
                    {METODOS_PAGO.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Fecha y método cuando es saldar total (simplificado) */}
            {saldarTotal && (
              <div className="bg-neutro-50 rounded-2xl p-4 space-y-4 border border-neutro-100">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-neutro-700 mb-2">
                    <CalendarDays size={16} className="text-neutro-400" />
                    Fecha del pago
                  </label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="input w-full h-12 text-base"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-neutro-700 mb-2">
                    <CreditCard size={16} className="text-neutro-400" />
                    ¿Cómo pagó?
                  </label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                    className="input w-full h-12 text-base"
                  >
                    {METODOS_PAGO.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* ── 3. Botón de acción ── */}
          {(saldarTotal || (mostrarFormaParcial && !saldarTotal)) && (
            <div className="space-y-2">
              <button
                onClick={handleRegistrar}
                disabled={procesando || montoInvalido}
                className={`w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold transition-all disabled:opacity-40 ${
                  saldarTotal
                    ? 'bg-primario-800 hover:bg-primario-900 text-white shadow-lg shadow-exito-200'
                    : 'btn btn-primary shadow-lg'
                }`}
              >
                {procesando ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={20} />
                )}
                {procesando
                  ? 'Registrando en Alegra…'
                  : saldarTotal
                    ? `Pagar ${formatCurrency(factura.saldo)}`
                    : 'Registrar abono'}
              </button>
              <p className="text-xs text-neutro-400 text-center">
                Esto crea un pago real en Alegra.
              </p>
            </div>
          )}

          {/* ── 4. Historial de abonos ── */}
          <div>
            <h4 className="text-sm font-semibold text-neutro-600 mb-2">Abonos anteriores</h4>
            {loadingAbonos ? (
              <div className="flex items-center gap-2 text-sm text-neutro-400 py-3">
                <Loader2 size={16} className="animate-spin" />
                Cargando…
              </div>
            ) : abonos.length === 0 ? (
              <div className="bg-neutro-50 rounded-xl p-4 text-center">
                <p className="text-sm text-neutro-500">No hay abonos todavía</p>
              </div>
            ) : (
              <div className="divide-y divide-neutro-100 border border-neutro-100 rounded-xl overflow-hidden">
                {abonos.map((abono) => (
                  <div key={abono.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-neutro-800">{formatCurrency(abono.monto)}</p>
                      <p className="text-sm text-neutro-500">
                        {formatDate(abono.fecha)} · {METODOS_PAGO.find(m => m.id === abono.metodoPago)?.label || abono.metodoPago}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

