import { useState } from 'react'
import { Save, Ban } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { momentoLocalCR, hoyEnCostaRica } from '../../utils/fechaCR'

/**
 * Corregir un tramo, anularlo o agregar uno que no se marcó (2026-10-30). Todo
 * pide motivo y queda en la bitácora. A la jornada abierta se le puede
 * corregir solo la entrada: sigue abierta.
 */
export default function ModalJornada({ tramo, guardar, onCerrar }) {
  const abierta = tramo?.estado === 'abierta'
  const [inicio, setInicio] = useState(tramo ? momentoLocalCR(tramo.inicio) : `${hoyEnCostaRica()}T08:00`)
  const [fin, setFin] = useState(tramo?.fin ? momentoLocalCR(tramo.fin) : '')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const enviar = async (cambios) => {
    setGuardando(true); setError('')
    try {
      await guardar({ jornadaId: tramo?.id, motivo, ...cambios })
      onCerrar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const sinMotivo = motivo.trim().length < 3
  return (
    <Modal titulo={tramo ? 'Corregir jornada' : 'Agregar jornada'} onCerrar={guardando ? () => {} : onCerrar} pie={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {tramo ? <Boton variante="peligro" icono={Ban} onClick={() => enviar({ anular: true })} cargando={guardando} disabled={sinMotivo}>Anular</Boton> : <span />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton icono={Save} onClick={() => enviar({ inicio, fin: fin || null })} cargando={guardando} disabled={sinMotivo || !inicio || (!abierta && !fin)}>Guardar</Boton>
        </div>
      </div>
    )}>
      <div className="space-y-4 p-4 sm:p-5">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-neutro-700">Entrada</span>
          <input type="datetime-local" aria-label="Entrada" value={inicio} onChange={e => setInicio(e.target.value)} className="input w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-neutro-700">Salida{abierta ? ' (vacía: sigue trabajando)' : ''}</span>
          <input type="datetime-local" aria-label="Salida" value={fin} onChange={e => setFin(e.target.value)} className="input w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-neutro-700">Motivo</span>
          <textarea value={motivo} maxLength={300} rows={2} onChange={e => setMotivo(e.target.value)}
            placeholder="Ej.: se le olvidó marcar la salida; salió a las 5" className="input w-full text-sm" />
        </label>
        {error && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}
        <p className="text-xs text-neutro-500">Hora de Costa Rica. Un tramo va hasta 16 horas y no puede pisar otro del mismo empleado.</p>
      </div>
    </Modal>
  )
}
