import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, X, Wallet } from 'lucide-react'
import { formatCurrency, formatDate, diasLabel, METODOS_PAGO } from '../../utils/cuentasPorCobrarUtils'

/**
 * Modal de una factura con saldo: monto/fecha/método del abono + historial
 * de abonos ya registrados. De pagos-proveedores/ModalDetalleCuenta.jsx,
 * simplificado (sin tabla de productos — no aplica acá) y con el toggle
 * completo/parcial reemplazado por un solo monto libre, porque el abono
 * siempre se valida contra el saldo real de Alegra al enviarlo, no antes.
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
  }

  const volverAAbonoParcial = () => {
    setSaldarTotal(false)
    setMonto('')
  }

  const dias = factura.diasRestantes

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
        {/* Handle bottom-sheet en móvil */}
        <div className="pt-3 pb-1 sm:hidden">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto" />
        </div>

        <div className="flex justify-between items-start p-6 pb-4 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Factura #{factura.numeroFactura}</p>
            <h3 className="text-xl font-bold text-gray-900">{clienteNombre}</h3>
          </div>
          <button onClick={onCerrar} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Vencimiento</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{formatDate(factura.fechaVencimiento)}</p>
              <p className={`text-xs mt-0.5 font-medium ${dias < 0 ? 'text-red-600' : dias <= 7 ? 'text-orange-600' : 'text-gray-500'}`}>{diasLabel(dias)}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <p className="text-xs text-blue-600 font-semibold">Saldo pendiente</p>
              <p className="text-lg font-bold text-blue-900 mt-0.5">{formatCurrency(factura.saldo)}</p>
            </div>
          </div>

          {/* Registrar abono */}
          <div className="bg-gray-50/70 rounded-2xl p-5 border border-gray-100 space-y-4">
            <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Registrar abono</h4>

            {/* Atajo para el caso más común: cancelar la factura entera sin
                tener que teclear el monto. */}
            {!saldarTotal ? (
              <button
                onClick={activarSaldarTotal}
                className="w-full flex items-center justify-center gap-2 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-100 transition-colors"
              >
                <Wallet size={16} />
                Saldar factura completa ({formatCurrency(factura.saldo)})
              </button>
            ) : (
              <div className="flex items-center justify-between gap-3 border border-emerald-200 bg-emerald-50 rounded-xl px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-emerald-800 flex items-center gap-1.5">
                    <Wallet size={15} /> Saldar factura completa
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Se pagará el saldo pendiente en Alegra y quedará en cero.
                  </p>
                </div>
                <button onClick={volverAAbonoParcial} className="text-xs text-emerald-700 underline shrink-0 hover:text-emerald-900">
                  Abonar otro monto
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Monto</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₡</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  min="0"
                  max={factura.saldo}
                  step="0.01"
                  placeholder={`Máx: ${formatCurrency(factura.saldo)}`}
                  disabled={saldarTotal}
                  className="input pl-8 w-full disabled:bg-gray-100 disabled:text-gray-500"
                  autoFocus
                />
              </div>
              {montoInvalido && monto !== '' && (
                <p className="text-xs text-red-600 mt-1">El monto debe ser mayor a 0 y no superar el saldo pendiente.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Método de pago</label>
                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="input w-full">
                  {METODOS_PAGO.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleRegistrar}
              disabled={procesando || montoInvalido}
              className="btn btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {procesando ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              {procesando ? 'Registrando en Alegra...' : saldarTotal ? 'Saldar factura completa' : 'Registrar abono'}
            </button>
            <p className="text-[11px] text-gray-400 text-center">Esto crea un pago real en Alegra sobre esta factura.</p>
          </div>

          {/* Historial de abonos */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Abonos registrados</h4>
            {loadingAbonos ? (
              <p className="text-sm text-gray-400">Cargando...</p>
            ) : abonos.length === 0 ? (
              <p className="text-sm text-gray-500">Todavía no hay abonos registrados sobre esta factura.</p>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {abonos.map((abono) => (
                  <div key={abono.id} className="p-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-gray-800">{formatCurrency(abono.monto)}</p>
                      <p className="text-xs text-gray-500">{formatDate(abono.fecha)} • {METODOS_PAGO.find(m => m.id === abono.metodoPago)?.label || abono.metodoPago}</p>
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
