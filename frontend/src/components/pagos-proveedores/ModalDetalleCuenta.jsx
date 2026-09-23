import { useEffect, useState } from 'react'
import { Ban, CalendarDays, CheckCircle2, CreditCard, Loader2, Wallet } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/pagosProveedoresUtils'
import { getOpcionesPago } from '../../services/configuracionService'
import { hoyEnCostaRica } from '../../utils/fechaCR'
import HojaModal from '../pagos/HojaModal'
import ResumenSaldo from '../pagos/ResumenSaldo'
import OpcionesPago from '../pagos/OpcionesPago'
import TablaProductosFactura from '../pagos/TablaProductosFactura'

/**
 * Pagarle a un proveedor.
 *
 * EL PAGO ES UN DOCUMENTO (migración 025). Antes, "Marcar como pagada" bajaba
 * el saldo a mano y no quedaba ni cuándo ni cómo se pagó. Ahora se registra
 * un pago con su fecha, el método y la referencia, y SALE DE CAJA GENERAL
 * (decisión del usuario: no hay cajas separadas); el saldo de la factura se calcula a partir de los pagos, y un
 * pago equivocado se ANULA con su motivo (reemplaza al viejo "Revertir a
 * pendiente", que borraba el rastro).
 *
 * Misma hoja que Cuentas por Cobrar: el saldo grande arriba y las dos
 * tarjetas grandes de decisión. Lo propio de pagar se conserva: las notas de
 * crédito del proveedor.
 */

export default function ModalDetalleCuenta({ cuenta, procesando, onRegistrarPago, onAnularPago, onCerrar }) {
  const yaPagada = cuenta.estado === 'PAGADA'

  const [seleccion, setSeleccion] = useState(yaPagada ? null : 'total')
  const [monto, setMonto] = useState('')
  // El día en Costa Rica, no en UTC: después de las 6 p.m. eso ya es mañana.
  const [fecha, setFecha] = useState(hoyEnCostaRica())

  const [metodos, setMetodos] = useState([])
  const [metodoPagoId, setMetodoPagoId] = useState(null)
  const [referencia, setReferencia] = useState('')

  const [anulando, setAnulando] = useState(null) // id del pago que se está anulando
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    let cancelado = false
    getOpcionesPago()
      .then(({ metodos }) => { if (!cancelado) setMetodos(metodos) })
      .catch(() => {})
    return () => { cancelado = true }
  }, [])

  const metodo = metodos.find((m) => m.id === metodoPagoId) || null
  const faltaReferencia = Boolean(metodo?.pideReferencia) && !referencia.trim()
  const pagarTodo = seleccion === 'total'
  const montoInvalido = !pagarTodo &&
    (!monto || Number(monto) <= 0 || Number(monto) > cuenta.saldoPendiente)
  const incompleto = !metodoPagoId || faltaReferencia

  const handleRegistrar = async () => {
    if (montoInvalido || incompleto) return
    // "Pagar todo" no manda un monto: el servidor relee el saldo CON BLOQUEO.
    const exito = await onRegistrarPago(cuenta.id, {
      aplicaciones: [pagarTodo
        ? { cuentaPorPagarId: cuenta.id, pagarTodo: true }
        : { cuentaPorPagarId: cuenta.id, monto: Number(monto) }],
      metodoPagoId,
      referencia: referencia.trim() || null,
      fecha
    })
    if (exito) onCerrar()
  }

  const handleAnular = async (pagoId) => {
    if (!motivo.trim()) return
    const exito = await onAnularPago(cuenta.id, pagoId, motivo.trim())
    if (exito) { setAnulando(null); setMotivo('') }
  }

  const pagos = cuenta.pagos || []

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

      {/* Lo pagado antes de que los pagos se registraran: no hay dato de
          cuándo ni desde qué cuenta, y no se inventa. */}
      {cuenta.pagadoSinDetalle > 0 && (
        <div className="flex items-baseline justify-between gap-3 rounded-xl border border-neutro-200 bg-neutro-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-neutro-700">Pagado antes de registrar pagos</p>
            <p className="text-xs text-neutro-500">Sin detalle de fecha ni de cuenta: se marcó como pagada a mano.</p>
          </div>
          <span className="shrink-0 text-base font-bold text-neutro-800">−{formatCurrency(cuenta.pagadoSinDetalle)}</span>
        </div>
      )}

      {pagos.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-neutro-600">Pagos registrados</h4>
          <div className="divide-y divide-neutro-100 overflow-hidden rounded-xl border border-neutro-100">
            {pagos.map((p) => (
              <div key={p.id} className={`px-4 py-3 ${p.anulado ? 'bg-neutro-50' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-base font-bold ${p.anulado ? 'text-neutro-400 line-through' : 'text-neutro-800'}`}>
                      {formatCurrency(p.monto)}
                    </p>
                    <p className="text-sm text-neutro-500">
                      {formatDate(p.fecha)} · {p.metodo} · de {p.cuenta}
                      {p.referencia ? ` · Ref. ${p.referencia}` : ''}
                    </p>
                    {p.montoPago > p.monto && (
                      <p className="text-xs text-neutro-400">Parte de un pago de {formatCurrency(p.montoPago)} que cubrió varias facturas</p>
                    )}
                    {p.anulado && (
                      <p className="text-sm text-peligro-600">Anulado{p.motivoAnulacion ? `: ${p.motivoAnulacion}` : ''}</p>
                    )}
                  </div>
                  {!p.anulado && anulando !== p.id && (
                    <button
                      type="button"
                      onClick={() => { setAnulando(p.id); setMotivo('') }}
                      disabled={procesando}
                      className="btn btn-outline inline-flex shrink-0 items-center gap-1.5 text-sm"
                    >
                      <Ban size={15} /> Anular
                    </button>
                  )}
                </div>
                {anulando === p.id && (
                  <div className="mt-3 space-y-2">
                    <input
                      type="text"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="¿Por qué se anula este pago?"
                      maxLength={500}
                      className="input h-11 w-full text-base"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAnular(p.id)}
                        disabled={procesando || !motivo.trim()}
                        className="btn inline-flex items-center gap-1.5 bg-peligro-600 text-white hover:bg-peligro-700 disabled:opacity-40"
                      >
                        {procesando ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                        Anular pago
                      </button>
                      <button type="button" onClick={() => setAnulando(null)} className="btn btn-outline">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

              <p className="flex items-center gap-2 text-sm text-neutro-600">
                <Wallet size={16} className="text-neutro-400" />
                Sale de <strong className="font-semibold text-neutro-800">Caja General</strong>
              </p>

              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutro-700">
                  <CreditCard size={16} className="text-neutro-400" />
                  ¿Cómo se pagó?
                </label>
                <select
                  value={metodoPagoId ?? ''}
                  onChange={(e) => { setMetodoPagoId(Number(e.target.value)); setReferencia('') }}
                  className="input h-12 w-full text-base"
                >
                  <option value="" disabled>Elegí el método…</option>
                  {metodos.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
                {/* Una transferencia sin número no se puede cuadrar después
                    contra el estado del banco. El catálogo dice cuáles la piden. */}
                {metodo?.pideReferencia && (
                  <input
                    type="text"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    placeholder={`Referencia de la ${metodo.nombre.toLowerCase()}…`}
                    maxLength={60}
                    className="input mt-2 h-12 w-full text-base"
                  />
                )}
              </div>

              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutro-700">
                  <CalendarDays size={16} className="text-neutro-400" />
                  Fecha del pago
                </label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  max={hoyEnCostaRica()}
                  className="input h-12 w-full text-base"
                />
              </div>
            </div>
          )}

          {seleccion && (
            <button
              onClick={handleRegistrar}
              disabled={procesando || montoInvalido || incompleto}
              className={`flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold transition-all disabled:opacity-40 ${
                pagarTodo ? 'bg-exito-600 text-white shadow-lg hover:bg-exito-700' : 'btn btn-primary shadow-lg'
              }`}
            >
              {procesando ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
              {procesando
                ? 'Guardando…'
                : pagarTodo ? `Pagar ${formatCurrency(cuenta.saldoPendiente)}` : 'Registrar abono'}
            </button>
          )}
        </>
      )}
    </HojaModal>
  )
}
