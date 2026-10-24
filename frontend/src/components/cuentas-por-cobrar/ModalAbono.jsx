import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, CalendarDays, CreditCard } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/cuentasPorCobrarUtils'
import { getMetodosPago } from '../../services/cuentasPorCobrarService'
import { hoyEnCostaRica } from '../../utils/fechaCR'
import HojaModal from '../pagos/HojaModal'
import ResumenSaldo from '../pagos/ResumenSaldo'
import OpcionesPago from '../pagos/OpcionesPago'
import TablaProductosFactura from '../pagos/TablaProductosFactura'

/**
 * Cobrar una factura de venta.
 *
 * QUÉ CAMBIÓ
 * El diseño es el mismo de antes —es el que se quiso conservar— pero ahora
 * está armado con las piezas de components/pagos/, así que Pagos a
 * Proveedores se ve igual sin que nadie mantenga dos veces la misma hoja.
 *
 * Y se le agregó el detalle de productos, que solo tenía el módulo de
 * pagar. Las líneas salen de la factura propia (GET /facturacion/facturas/:id).
 */

/**
 * El método de un abono ya registrado, como texto. Los copiados de Alegra
 * traen su clave cruda ('cash', 'TRANSFER', 'SINPE_MOVIL'); los propios, el
 * nombre del catálogo ('Efectivo'). La lista de abajo es solo para traducir
 * los viejos.
 *
 * Antes se buscaba en METODOS_PAGO, que se dejó de importar al pasar el
 * cobro a la base propia: abrir una factura con abonos rompía la pantalla.
 */
const METODOS_ALEGRA = {
  cash: 'Efectivo', transfer: 'Transferencia', 'credit-card': 'Tarjeta de crédito',
  'debit-card': 'Tarjeta de débito', check: 'Cheque', sinpe_movil: 'SINPE Móvil'
}
const nombreMetodo = (texto) => METODOS_ALEGRA[String(texto || '').toLowerCase()] || texto || '—'

export default function ModalAbono({
  factura, clienteNombre, procesando, onRegistrar, onCargarAbonos, onCargarProductos, onCerrar
}) {
  const [seleccion, setSeleccion] = useState(null) // 'total' | 'parcial'
  const [monto, setMonto] = useState('')
  // El día en Costa Rica, no en UTC: después de las 6 de la tarde eso da
  // mañana, y un abono recibido de noche quedaría fechado al día siguiente.
  const [fecha, setFecha] = useState(hoyEnCostaRica())

  // Los métodos salen de NUESTRO catálogo. La lista que había escrita a mano
  // no tenía SINPE Móvil, que es como paga mucha gente.
  const [metodos, setMetodos] = useState([])
  const [metodoPagoId, setMetodoPagoId] = useState(null)
  const [referencia, setReferencia] = useState('')

  const [abonos, setAbonos] = useState([])
  const [cargandoAbonos, setCargandoAbonos] = useState(true)
  const [productos, setProductos] = useState([])
  const [cargandoProductos, setCargandoProductos] = useState(true)

  useEffect(() => {
    let cancelado = false
    getMetodosPago().then((lista) => {
      if (cancelado) return
      setMetodos(lista)
      const efectivo = lista.find(m => m.clave === 'efectivo') || lista[0]
      setMetodoPagoId(efectivo ? efectivo.id : null)
    }).catch(() => {})
    return () => { cancelado = true }
  }, [])

  useEffect(() => {
    let cancelado = false
    setCargandoAbonos(true)
    onCargarAbonos(factura.id).then((data) => {
      if (!cancelado) { setAbonos(data); setCargandoAbonos(false) }
    })
    return () => { cancelado = true }
  }, [factura.id, onCargarAbonos])

  useEffect(() => {
    if (!onCargarProductos) { setCargandoProductos(false); return }
    let cancelado = false
    setCargandoProductos(true)
    onCargarProductos(factura.id).then((data) => {
      if (!cancelado) { setProductos(data); setCargandoProductos(false) }
    })
    return () => { cancelado = true }
  }, [factura.id, onCargarProductos])

  const saldarTotal = seleccion === 'total'
  const montoNum = Number(monto)
  const metodo = metodos.find(m => m.id === metodoPagoId) || null
  const faltaReferencia = Boolean(metodo?.pideReferencia) && !referencia.trim()
  const montoInvalido = !saldarTotal && (!monto || montoNum <= 0 || montoNum > factura.saldo)

  const handleRegistrar = async () => {
    if (montoInvalido || faltaReferencia || !metodoPagoId) return
    // Saldar total no manda un monto: el servidor relee el saldo CON BLOQUEO
    // al aplicar el abono, así no falla si otra caja cobró mientras tanto ni
    // deja un resto de céntimos.
    const exito = await onRegistrar({
      facturaId: factura.id,
      numero: factura.numero,
      monto: saldarTotal ? factura.saldo : montoNum,
      fecha,
      metodoPagoId,
      referencia: referencia.trim() || null,
      saldarTotal
    })
    if (exito) onCerrar()
  }

  const elegir = (cual) => {
    setSeleccion(cual)
    setMonto(cual === 'total' ? String(factura.saldo) : '')
  }

  return (
    <HojaModal
      titulo={clienteNombre}
      subtitulo={`Factura #${factura.numero}`}
      onCerrar={onCerrar}
    >
      <ResumenSaldo
        saldo={factura.saldo}
        fechaVencimiento={factura.fechaVencimiento}
        diasRestantes={factura.diasRestantes}
      />

      <TablaProductosFactura productos={productos} cargando={cargandoProductos} />

      <OpcionesPago
        saldo={factura.saldo}
        seleccion={seleccion}
        onSeleccionar={elegir}
        deshabilitado={procesando}
      />

      {seleccion && (
        <div className="space-y-4 rounded-2xl border border-neutro-100 bg-neutro-50 p-4">
          {seleccion === 'parcial' && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-neutro-700">¿Cuánto va a abonar?</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-neutro-500">₡</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  min="0"
                  max={factura.saldo}
                  step="0.01"
                  placeholder="0,00"
                  className="input h-12 w-full pl-10 text-lg"
                  autoFocus
                />
              </div>
              <p className="mt-1.5 text-xs text-neutro-400">Máximo: {formatCurrency(factura.saldo)}</p>
              {montoInvalido && monto !== '' && (
                <p className="mt-1.5 text-sm font-medium text-peligro-600">
                  El monto debe ser mayor a ₡0 y no superar el saldo.
                </p>
              )}
            </div>
          )}

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

          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutro-700">
              <CreditCard size={16} className="text-neutro-400" />
              ¿Cómo pagó?
            </label>
            <select
              value={metodoPagoId ?? ''}
              onChange={(e) => { setMetodoPagoId(Number(e.target.value)); setReferencia('') }}
              className="input h-12 w-full text-base"
            >
              {metodos.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>

            {/* SINPE y transferencia sin número son imposibles de cuadrar
                después contra el banco. El catálogo dice cuáles lo piden. */}
            {metodo?.pideReferencia && (
              <input
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder={`Referencia del ${metodo.label.toLowerCase()}…`}
                maxLength={60}
                className="input mt-2 h-12 w-full text-base"
              />
            )}
          </div>
        </div>
      )}

      {seleccion && (
        <div className="space-y-2">
          <button
            onClick={handleRegistrar}
            disabled={procesando || montoInvalido}
            className={`flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold transition-all disabled:opacity-40 ${
              saldarTotal ? 'bg-exito-600 text-white shadow-lg hover:bg-exito-700' : 'btn btn-primary shadow-lg'
            }`}
          >
            {procesando ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
            {procesando
              ? 'Registrando…'
              : saldarTotal ? `Pagar ${formatCurrency(factura.saldo)}` : 'Registrar abono'}
          </button>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-semibold text-neutro-600">Abonos anteriores</h4>
        {cargandoAbonos ? (
          <p className="flex items-center gap-2 py-3 text-sm text-neutro-400">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </p>
        ) : abonos.length === 0 ? (
          <p className="rounded-xl bg-neutro-50 p-4 text-center text-sm text-neutro-500">
            No hay abonos todavía
          </p>
        ) : (
          <div className="divide-y divide-neutro-100 overflow-hidden rounded-xl border border-neutro-100">
            {abonos.map((abono) => (
              <div key={abono.id} className={`px-4 py-3 ${abono.anulado ? 'bg-neutro-50' : ''}`}>
                <p className={`text-base font-bold ${abono.anulado ? 'text-neutro-400 line-through' : 'text-neutro-800'}`}>
                  {formatCurrency(abono.monto)}
                </p>
                {/* La fecha no se parte: en pantalla angosta la línea bajaba
                    por donde cayera y dejaba «10 oct» arriba y «2026» abajo.
                    El método puede bajar solo, y la referencia va aparte y
                    se corta si es una cadena larga. */}
                <p className="text-sm text-neutro-500">
                  <span className="whitespace-nowrap">{formatDate(abono.fecha)}</span> · {nombreMetodo(abono.metodo)}
                </p>
                {abono.referencia && <p className="break-all text-sm text-neutro-500">Ref. {abono.referencia}</p>}
                {abono.anulado && (
                  <p className="text-sm text-peligro-600">Anulado{abono.motivoAnulacion ? `: ${abono.motivoAnulacion}` : ''}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </HojaModal>
  )
}
