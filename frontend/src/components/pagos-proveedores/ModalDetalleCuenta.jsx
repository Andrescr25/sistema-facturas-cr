import { useState } from 'react'
import { CheckCircle2, Loader2, RotateCcw, StickyNote } from 'lucide-react'
import { formatCurrency, formatDate, calcularPayloadPago } from '../../utils/pagosProveedoresUtils'
import HojaModal from '../pagos/HojaModal'
import ResumenSaldo from '../pagos/ResumenSaldo'
import OpcionesPago from '../pagos/OpcionesPago'
import TablaProductosFactura from '../pagos/TablaProductosFactura'

/**
 * Pagarle a un proveedor.
 *
 * QUÉ CAMBIÓ
 * Antes era un diálogo centrado con una rejilla de cuatro celdas arriba y
 * un par de botones chatos para elegir entre pago completo y abono. Ahora
 * usa la misma hoja que Cuentas por Cobrar —que es el diseño que se quiso
 * para los dos— con el saldo grande arriba y las dos tarjetas grandes de
 * decisión.
 *
 * Lo propio de pagar se conserva entero: las notas de crédito del proveedor,
 * la nota libre del pago y el revertir a pendiente. La tabla de productos es
 * la misma de siempre, solo que ahora compartida.
 */
export default function ModalDetalleCuenta({ cuenta, procesando, onRegistrarPago, onCerrar }) {
  const yaPagada = cuenta.estado === 'PAGADA'
  const puedeRevertir = cuenta.estado === 'PAGADA' || cuenta.estado === 'VENCIDA'

  const [seleccion, setSeleccion] = useState(yaPagada ? null : 'total')
  const [monto, setMonto] = useState('')
  const [notas, setNotas] = useState(cuenta.notas || '')

  const tipoPago = seleccion === 'parcial' ? 'parcial' : 'completo'
  const montoInvalido = seleccion === 'parcial' &&
    (!monto || Number(monto) <= 0 || Number(monto) > cuenta.saldoPendiente)

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
    const exito = await onRegistrarPago(cuenta.id, {
      estado: 'PENDIENTE', saldoPendiente: saldoSinPagos, notas: notas.trim() || null
    })
    if (exito) onCerrar()
  }

  return (
    <HojaModal
      titulo={cuenta.proveedorNombre}
      subtitulo={`Factura #${cuenta.numeroConsecutivo} · ${cuenta.proveedorCedula}`}
      ancho="sm:max-w-2xl"
      onCerrar={onCerrar}
    >
      <ResumenSaldo
        saldo={cuenta.saldoPendiente}
        etiqueta={yaPagada ? 'Saldo (ya pagada)' : 'Saldo pendiente'}
        fechaVencimiento={cuenta.fechaVencimiento}
        diasRestantes={cuenta.diasRestantes}
      />

      <div className="flex flex-wrap gap-x-6 gap-y-1 px-1 text-sm text-neutro-500">
        <span>Emitida el {formatDate(cuenta.fechaEmision)}</span>
        <span>Monto original {formatCurrency(cuenta.montoTotal)}</span>
      </div>

      {/* Notas de crédito: solo existen del lado de pagar. */}
      {cuenta.notasCredito?.length > 0 && (
        <div className="rounded-xl border border-exito-200 bg-exito-50/50 p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h4 className="text-sm font-semibold text-exito-800">
              Notas de crédito aplicadas ({cuenta.notasCredito.length})
            </h4>
            <span className="text-sm font-bold text-exito-700">−{formatCurrency(cuenta.creditoAplicado)}</span>
          </div>
          <p className="mb-2 text-xs text-exito-700/80">
            Ya están restadas del saldo. El inventario NO se ajustó: revisá si hubo devolución física.
          </p>
          <div className="space-y-2">
            {cuenta.notasCredito.map((nc) => (
              <div key={nc.id} className="rounded-lg border border-exito-100 bg-white p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-neutro-800">
                    {nc.numeroConsecutivo || nc.clave.slice(-10)}
                  </span>
                  <span className="text-sm font-bold text-neutro-900">{formatCurrency(nc.monto)}</span>
                </div>
                {nc.razon && <p className="mt-0.5 text-xs text-neutro-500">Razón: {nc.razon}</p>}
                {nc.lineas?.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {nc.lineas.map((l, i) => (
                      <li key={i} className="text-xs text-neutro-600">
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

      {/* Las líneas ya vienen con la cuenta, no hay que ir a buscarlas. */}
      <TablaProductosFactura
        productos={(cuenta.productos || []).map((p) => ({
          id: p.id,
          codigo: p.codigoProveedor,
          descripcion: p.descripcion,
          cantidad: p.cantidad,
          precioUnitario: p.precioUnitario,
          total: p.totalLinea
        }))}
        cargando={false}
      />

      {!yaPagada && (
        <>
          <OpcionesPago
            saldo={cuenta.saldoPendiente}
            seleccion={seleccion}
            onSeleccionar={setSeleccion}
            etiquetaTotal="Pagar todo el saldo"
            etiquetaParcial="Abonar una parte"
            pieParcial="Registrar un pago parcial"
            deshabilitado={procesando}
          />

          {seleccion && (
            <div className="space-y-4 rounded-2xl border border-neutro-100 bg-neutro-50 p-4">
              {seleccion === 'parcial' && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-neutro-700">¿Cuánto se le abonó?</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-neutro-500">₡</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      min="0"
                      max={cuenta.saldoPendiente}
                      step="0.01"
                      placeholder="0,00"
                      className="input h-12 w-full pl-10 text-lg"
                      autoFocus
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-neutro-400">Máximo: {formatCurrency(cuenta.saldoPendiente)}</p>
                  {montoInvalido && monto !== '' && (
                    <p className="mt-1.5 text-sm font-medium text-peligro-600">
                      El monto debe ser mayor a ₡0 y no superar el saldo pendiente.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutro-700">
                  <StickyNote size={16} className="text-neutro-400" />
                  Nota (opcional)
                </label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={2}
                  placeholder="Ej: transferencia SINPE, comprobante #123…"
                  className="input w-full resize-none"
                />
              </div>
            </div>
          )}

          {seleccion && (
            <button
              onClick={handleRegistrar}
              disabled={procesando || montoInvalido}
              className={`flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold transition-all disabled:opacity-40 ${
                seleccion === 'total' ? 'bg-exito-600 text-white shadow-lg hover:bg-exito-700' : 'btn btn-primary shadow-lg'
              }`}
            >
              {procesando ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
              {procesando
                ? 'Guardando…'
                : seleccion === 'total' ? 'Marcar como pagada' : 'Registrar abono'}
            </button>
          )}
        </>
      )}

      {puedeRevertir && (
        <button
          onClick={handleRevertir}
          disabled={procesando}
          className="btn btn-outline flex w-full items-center justify-center gap-2 disabled:opacity-50"
        >
          {procesando ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
          Revertir a pendiente
        </button>
      )}
    </HojaModal>
  )
}
