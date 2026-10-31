import { useEffect, useState } from 'react'
import { Banknote } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { getMetodosPago } from '../../services/cuentasPorCobrarService'
import { colones } from '../../utils/colones'
import { hoyEnCostaRica } from '../../utils/fechaCR'

/**
 * Registrar un pago a un empleado (2026-10-30): el usuario decidió que sale
 * «como salida de caja». Método (y referencia si la pide) y fecha, como un
 * pago a proveedor. El monto lo calcula el servidor: acá solo se muestra.
 */
export default function ModalPagoEmpleado({ titulo, monto, detalle, desde, onConfirmar, onCerrar }) {
  const [metodos, setMetodos] = useState([])
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [referencia, setReferencia] = useState('')
  const [fecha, setFecha] = useState(hoyEnCostaRica())
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const metodo = metodos.find(m => String(m.id) === String(metodoPagoId))

  useEffect(() => { getMetodosPago().then(setMetodos).catch(() => setError('No se pudieron consultar los métodos de pago.')) }, [])

  const confirmar = async () => {
    setGuardando(true); setError('')
    try {
      await onConfirmar({ metodoPagoId: Number(metodoPagoId), referencia, fecha, observaciones })
      onCerrar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal titulo={titulo} onCerrar={guardando ? () => {} : onCerrar} pie={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
        <Boton icono={Banknote} onClick={confirmar} cargando={guardando} disabled={!metodo || (metodo.pideReferencia && !referencia.trim())}>Registrar pago</Boton>
      </div>
    )}>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="rounded-xl bg-exito-50 p-4">
          <p className="text-sm font-semibold text-exito-800">Se paga</p>
          <p className="text-3xl font-bold text-exito-900">{colones(monto)}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {detalle.map(d => (
              <li key={d.nombre} className="flex justify-between gap-3 text-exito-900"><span>{d.nombre}</span><span className="font-semibold">{d.monto < 0 ? '−' : ''}{colones(Math.abs(d.monto))}</span></li>
            ))}
          </ul>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-neutro-700">Método</span>
          <select aria-label="Método de pago" value={metodoPagoId} onChange={e => setMetodoPagoId(e.target.value)} className="input w-full">
            <option value="">Elegí cómo se paga</option>
            {metodos.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        {metodo?.pideReferencia && (
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-neutro-700">Referencia</span>
            <input aria-label="Referencia" value={referencia} maxLength={60} onChange={e => setReferencia(e.target.value)} className="input w-full" />
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-neutro-700">Fecha del pago</span>
          <input type="date" aria-label="Fecha del pago" value={fecha} min={desde} max={hoyEnCostaRica()} onChange={e => e.target.value && setFecha(e.target.value)} className="input w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-neutro-700">Observaciones (opcional)</span>
          <input aria-label="Observaciones" value={observaciones} maxLength={500} onChange={e => setObservaciones(e.target.value)} className="input w-full" />
        </label>
        {error && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}
        <p className="text-xs text-neutro-500">Sale de Caja General. En efectivo, se resta en el cierre de caja de ese día.</p>
      </div>
    </Modal>
  )
}
