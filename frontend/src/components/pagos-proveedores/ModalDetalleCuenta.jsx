import { useState } from 'react'
import { CheckCircle2, Loader2, RotateCcw, X } from 'lucide-react'
import { formatCurrency, formatDate, diasLabel, calcularPayloadPago } from '../../utils/pagosProveedoresUtils'

/**
 * Modal de detalle de una cuenta por pagar: info completa, tabla de
 * productos de la factura, y las acciones de pago (completo, abono parcial
 * con nota, o revertir a pendiente). Reemplaza el "expandir en la lista" +
 * botones sueltos que tenía la versión anterior de PagosProveedores.jsx —
 * ahora todo el flujo de registrar un pago vive en un solo lugar, con
 * feedback de carga propio.
 */
export default function ModalDetalleCuenta({ cuenta, procesando, onRegistrarPago, onCerrar }) {
  const [tipoPago, setTipoPago] = useState('completo')
  const [monto, setMonto] = useState('')
  const [notas, setNotas] = useState(cuenta.notas || '')

  const dias = cuenta.diasRestantes
  const yaPagada = cuenta.estado === 'PAGADA'
  const puedeRevertir = cuenta.estado === 'PAGADA' || cuenta.estado === 'VENCIDA'

  const montoInvalido = tipoPago === 'parcial' && (!monto || Number(monto) <= 0 || Number(monto) > cuenta.saldoPendiente)

  const handleRegistrar = async () => {
    if (montoInvalido) return
    const payload = calcularPayloadPago(cuenta, { tipo: tipoPago, monto, notas: notas.trim() || null })
    const exito = await onRegistrarPago(cuenta.id, payload)
    if (exito) onCerrar()
  }

  const handleRevertir = async () => {
    // Revertir vuelve al monto original MENOS las notas de crédito ya
    // aplicadas: esas no dependen de si se pagó o no, siguen siendo un
    // descuento del proveedor. Restaurar el monto total pelado las borraría
    // y terminaríamos pagando de más.
    const saldoSinPagos = Math.max(0, cuenta.montoTotal - (cuenta.creditoAplicado || 0))
    const exito = await onRegistrarPago(cuenta.id, { estado: 'PENDIENTE', saldoPendiente: saldoSinPagos, notas: notas.trim() || null })
    if (exito) onCerrar()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Factura #{cuenta.numeroConsecutivo}</p>
            <h3 className="text-xl font-bold text-gray-900">{cuenta.proveedorNombre}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{cuenta.proveedorCedula}</p>
          </div>
          <button onClick={onCerrar} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Emisión</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{formatDate(cuenta.fechaEmision)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Vencimiento</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{formatDate(cuenta.fechaVencimiento)}</p>
              <p className={`text-xs mt-0.5 font-medium ${dias < 0 ? 'text-red-600' : dias <= 7 ? 'text-orange-600' : 'text-gray-500'}`}>{diasLabel(dias)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Monto total</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{formatCurrency(cuenta.montoTotal)}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <p className="text-xs text-blue-600 font-semibold">Saldo pendiente</p>
              <p className="text-lg font-bold text-blue-900 mt-0.5">{formatCurrency(cuenta.saldoPendiente)}</p>
            </div>
          </div>

          {/* Notas de crédito aplicadas */}
          {cuenta.notasCredito?.length > 0 && (
            <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-3">
              <div className="flex items-baseline justify-between mb-2">
                <h4 className="text-sm font-semibold text-emerald-800">
                  Notas de crédito aplicadas ({cuenta.notasCredito.length})
                </h4>
                <span className="text-sm font-bold text-emerald-700">
                  −{formatCurrency(cuenta.creditoAplicado)}
                </span>
              </div>
              <p className="text-xs text-emerald-700/80 mb-2">
                Ya están restadas del saldo. El inventario NO se ajustó: revisá si hubo devolución física.
              </p>
              <div className="space-y-2">
                {cuenta.notasCredito.map((nc) => (
                  <div key={nc.id} className="bg-white rounded-lg p-2.5 border border-emerald-100">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-800">
                        {nc.numeroConsecutivo || nc.clave.slice(-10)}
                      </span>
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(nc.monto)}</span>
                    </div>
                    {nc.razon && <p className="text-xs text-gray-500 mt-0.5">Razón: {nc.razon}</p>}
                    {nc.lineas?.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {nc.lineas.map((l, i) => (
                          <li key={i} className="text-xs text-gray-600">
                            • {l.descripcion} — {l.cantidad} {l.unidadMedida || 'unid'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Productos */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Productos incluidos</h4>
            {cuenta.productos.length === 0 ? (
              <p className="text-sm text-gray-500">Sin detalle de productos.</p>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-gray-500">
                      <th className="py-2 px-3">Descripción</th>
                      <th className="py-2 px-3">Código</th>
                      <th className="py-2 px-3 text-right">Cantidad</th>
                      <th className="py-2 px-3 text-right">Precio</th>
                      <th className="py-2 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cuenta.productos.map((producto) => (
                      <tr key={producto.id} className="text-gray-700">
                        <td className="py-2 px-3">{producto.descripcion}</td>
                        <td className="py-2 px-3 text-xs text-gray-500">{producto.codigoProveedor}</td>
                        <td className="py-2 px-3 text-right">{producto.cantidad}</td>
                        <td className="py-2 px-3 text-right">{formatCurrency(producto.precioUnitario)}</td>
                        <td className="py-2 px-3 text-right">{formatCurrency(producto.totalLinea)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Registrar pago */}
          {!yaPagada && (
            <div className="bg-gray-50/70 rounded-2xl p-5 border border-gray-100 space-y-4">
              <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Registrar pago</h4>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTipoPago('completo')}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${tipoPago === 'completo' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
                >
                  Pago completo
                </button>
                <button
                  type="button"
                  onClick={() => setTipoPago('parcial')}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${tipoPago === 'parcial' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
                >
                  Abono parcial
                </button>
              </div>

              {tipoPago === 'parcial' && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Monto abonado</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₡</span>
                    <input
                      type="number"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      min="0"
                      max={cuenta.saldoPendiente}
                      step="0.01"
                      placeholder={`Máx: ${formatCurrency(cuenta.saldoPendiente)}`}
                      className="input pl-8 w-full"
                    />
                  </div>
                  {montoInvalido && monto !== '' && (
                    <p className="text-xs text-red-600 mt-1">El monto debe ser mayor a 0 y no superar el saldo pendiente.</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Nota (opcional)</label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={2}
                  placeholder="Ej: transferencia SINPE, comprobante #123..."
                  className="input w-full"
                />
              </div>

              <button
                onClick={handleRegistrar}
                disabled={procesando || montoInvalido}
                className="btn btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {procesando ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                {procesando ? 'Guardando...' : tipoPago === 'completo' ? 'Marcar como pagada' : 'Registrar abono'}
              </button>
            </div>
          )}

          {puedeRevertir && (
            <button
              onClick={handleRevertir}
              disabled={procesando}
              className="btn btn-outline w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {procesando ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
              Revertir a pendiente
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
