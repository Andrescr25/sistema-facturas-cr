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
  const diasColor = dias < 0 ? 'text-red-600' : dias <= 7 ? 'text-orange-600' : 'text-gray-500'
  const diasBg = dias < 0 ? 'bg-red-50 border-red-100' : dias <= 7 ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92vh] overflow-hidden flex flex-col">

        {/* Handle para arrastrar en móvil */}
        <div className="pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1.5 bg-gray-300 rounded-full mx-auto" />
        </div>

        {/* ─── Encabezado ─── */}
        <div className="flex justify-between items-center px-5 py-4 sm:px-6 sm:py-5 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-[13px] text-gray-400 font-medium">Factura #{factura.numeroFactura}</p>
            <h3 className="text-lg font-bold text-gray-900 truncate">{clienteNombre}</h3>
          </div>
          <button
            onClick={onCerrar}
            className="ml-3 shrink-0 p-2.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors"
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
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
              <p className="text-sm text-blue-600 font-medium mb-1">Saldo pendiente</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-blue-900">{formatCurrency(factura.saldo)}</p>
            </div>

            {/* Fecha de vencimiento */}
            <div className={`${diasBg} border rounded-xl px-4 py-3 flex items-center gap-3`}>
              <Clock size={18} className={diasColor} />
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Vence: {formatDate(factura.fechaVencimiento)}
                </p>
                <p className={`text-xs font-medium ${diasColor}`}>{diasLabel(dias)}</p>
              </div>
            </div>
          </div>

          {/* ── 2. Opciones de pago ── */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">¿Cómo desea pagar?</p>

            {/* Opción A: Pagar todo */}
            <button
              onClick={activarSaldarTotal}
              disabled={procesando}
              className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                saldarTotal
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                  : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  saldarTotal ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-600'
                }`}>
                  <Wallet size={20} />
                </div>
                <div className="min-w-0">
                  <p className={`text-base font-bold ${saldarTotal ? 'text-emerald-800' : 'text-gray-800'}`}>
                    Pagar todo el saldo
                  </p>
                  <p className={`text-sm ${saldarTotal ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {formatCurrency(factura.saldo)} — queda en ₡0
                  </p>
                </div>
                {saldarTotal && (
                  <CheckCircle2 size={22} className="shrink-0 ml-auto text-emerald-500" />
                )}
              </div>
            </button>

            {/* Opción B: Abonar otro monto */}
            <button
              onClick={volverAAbonoParcial}
              disabled={procesando}
              className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                mostrarFormaParcial && !saldarTotal
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  mostrarFormaParcial && !saldarTotal ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-600'
                }`}>
                  <CircleDollarSign size={20} />
                </div>
                <div className="min-w-0">
                  <p className={`text-base font-bold ${mostrarFormaParcial && !saldarTotal ? 'text-blue-800' : 'text-gray-800'}`}>
                    Abonar otro monto
                  </p>
                  <p className={`text-sm ${mostrarFormaParcial && !saldarTotal ? 'text-blue-600' : 'text-gray-500'}`}>
                    Pagar una parte del saldo
                  </p>
                </div>
                {mostrarFormaParcial && !saldarTotal && (
                  <ChevronDown size={22} className="shrink-0 ml-auto text-blue-500" />
                )}
              </div>
            </button>

            {/* Formulario de abono parcial (solo visible cuando se selecciona) */}
            {mostrarFormaParcial && !saldarTotal && (
              <div className="bg-gray-50 rounded-2xl p-4 space-y-4 border border-gray-100">
                {/* Monto */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    ¿Cuánto va a abonar?
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg">₡</span>
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
                  <p className="text-xs text-gray-400 mt-1.5">
                    Máximo: {formatCurrency(factura.saldo)}
                  </p>
                  {montoInvalido && monto !== '' && (
                    <p className="text-sm text-red-600 mt-1.5 font-medium">
                      ⚠ El monto debe ser mayor a ₡0 y no superar el saldo.
                    </p>
                  )}
                </div>

                {/* Fecha */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <CalendarDays size={16} className="text-gray-400" />
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
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <CreditCard size={16} className="text-gray-400" />
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
              <div className="bg-gray-50 rounded-2xl p-4 space-y-4 border border-gray-100">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <CalendarDays size={16} className="text-gray-400" />
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
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <CreditCard size={16} className="text-gray-400" />
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
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200'
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
              <p className="text-xs text-gray-400 text-center">
                Esto crea un pago real en Alegra.
              </p>
            </div>
          )}

          {/* ── 4. Historial de abonos ── */}
          <div>
            <h4 className="text-sm font-semibold text-gray-600 mb-2">Abonos anteriores</h4>
            {loadingAbonos ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
                <Loader2 size={16} className="animate-spin" />
                Cargando…
              </div>
            ) : abonos.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-500">No hay abonos todavía</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {abonos.map((abono) => (
                  <div key={abono.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-gray-800">{formatCurrency(abono.monto)}</p>
                      <p className="text-sm text-gray-500">
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

