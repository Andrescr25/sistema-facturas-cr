import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { useProximaVisita } from '../../hooks/useProximaVisita'
import { MOTIVOS_VISITA, fechasParaProximaVisita } from '../../utils/visitaPreventa'
import { sumarDias, fechaEnPalabras } from '../../utils/fechaCR'

const OPCION = 'flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold transition-colors'
const ELEGIDA = 'border-primario-500 bg-primario-50 text-primario-900'
const LIBRE = 'border-neutro-200 bg-white text-neutro-700 hover:border-neutro-300'

/**
 * «Próxima visita» (F4 del agente, 2026-10-29): el cliente no compró hoy.
 *
 * El motivo es obligatorio —es lo que el administrador revisa después— y la
 * fecha viene elegida: hoy más su rotación («sí, por defecto, así tal cual»).
 * Para que el agente planifique a su gusto puede tomar otra o escribirla.
 * El GPS se toma al guardar (useProximaVisita).
 */
export default function ModalProximaVisita({ cliente, hoy, onCerrar, onGuardada }) {
  const opciones = fechasParaProximaVisita(hoy, cliente.proximaSugerida, cliente.rotacion?.dias)
  const [motivo, setMotivo] = useState('')
  const [fecha, setFecha] = useState(opciones[0].fecha)
  const [nota, setNota] = useState('')
  const { guardar, guardando, error } = useProximaVisita()
  const otraFecha = !opciones.some(o => o.fecha === fecha)

  const confirmar = async () => {
    const visita = await guardar({ clienteId: cliente.id, motivo, proximaFecha: fecha, nota })
    if (visita) onGuardada(visita)
  }

  return (
    <Modal titulo={`Próxima visita · ${cliente.nombre}`} onCerrar={guardando ? () => {} : onCerrar} pie={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
        <Boton icono={CalendarClock} onClick={confirmar} cargando={guardando} disabled={!motivo || !fecha}>Guardar próxima visita</Boton>
      </div>
    )}>
      <div className="space-y-5 p-4 sm:p-5">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-neutro-500">¿Por qué no compró?</legend>
          {MOTIVOS_VISITA.map(m => (
            <button key={m.clave} type="button" aria-pressed={motivo === m.clave} onClick={() => setMotivo(m.clave)}
              className={`${OPCION} ${motivo === m.clave ? ELEGIDA : LIBRE}`}>{m.nombre}</button>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-neutro-500">¿Cuándo se vuelve?</legend>
          {opciones.map(o => (
            <button key={o.clave} type="button" aria-pressed={fecha === o.fecha} onClick={() => setFecha(o.fecha)}
              className={`${OPCION} ${fecha === o.fecha ? ELEGIDA : LIBRE}`}>
              <span>{o.nombre}</span><span className="shrink-0 text-xs font-bold">{fechaEnPalabras(o.fecha, { day: 'numeric', month: 'short' })}</span>
            </button>
          ))}
          <label className={`${OPCION} ${otraFecha ? ELEGIDA : LIBRE}`}>
            <span>Otra fecha</span>
            <input type="date" aria-label="Otra fecha" min={sumarDias(hoy, 1)} max={sumarDias(hoy, 180)} value={otraFecha ? fecha : ''}
              onChange={e => e.target.value && setFecha(e.target.value)} className="input h-9 w-40 shrink-0 text-sm" />
          </label>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-neutro-500">Nota (opcional)</span>
          <textarea value={nota} maxLength={500} rows={2} onChange={e => setNota(e.target.value)}
            placeholder="Ej.: dijo que pasara el viernes en la tarde" className="input w-full text-sm" />
        </label>

        {error && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}
        <p className="text-xs text-neutro-500">Al guardar se anota la ubicación del dispositivo. Si después le factura, manda la factura.</p>
      </div>
    </Modal>
  )
}
