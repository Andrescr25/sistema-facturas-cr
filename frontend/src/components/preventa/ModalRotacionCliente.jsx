import { useState } from 'react'
import { Repeat } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { useFichaDesdeVisita } from '../../hooks/useFichaDesdeVisita'

const COMUNES = [7, 15, 22, 30]
const OPCION = 'flex min-h-11 items-center justify-center rounded-xl border-2 px-3 text-sm font-bold transition-colors'

/**
 * Cada cuántos días se visita a este cliente (2026-10-29: «que el agente pueda
 * editar la rotación»). La próxima visita se recalcula sola desde su última
 * factura; el cambio queda en la bitácora.
 */
export default function ModalRotacionCliente({ cliente, onCerrar, onGuardada }) {
  const [dias, setDias] = useState(String(cliente.rotacion?.dias || ''))
  const { guardar, guardando, error } = useFichaDesdeVisita()
  const n = Number(dias)
  const valido = Number.isInteger(n) && n >= 1 && n <= 365

  const confirmar = async () => {
    const r = await guardar(cliente.id, { rotacionDias: n })
    if (r) onGuardada(n)
  }

  return (
    <Modal titulo={`Rotación · ${cliente.nombre}`} onCerrar={guardando ? () => {} : onCerrar} pie={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
        <Boton icono={Repeat} onClick={confirmar} cargando={guardando} disabled={!valido || n === cliente.rotacion?.dias}>Guardar rotación</Boton>
      </div>
    )}>
      <div className="space-y-4 p-4 sm:p-5">
        <p className="text-sm text-neutro-600">¿Cada cuántos días se le visita? La próxima visita se calcula desde su última factura.</p>
        <div className="grid grid-cols-4 gap-2">
          {COMUNES.map(d => (
            <button key={d} type="button" aria-pressed={n === d} onClick={() => setDias(String(d))}
              className={`${OPCION} ${n === d ? 'border-primario-500 bg-primario-50 text-primario-900' : 'border-neutro-200 bg-white text-neutro-700 hover:border-neutro-300'}`}>
              {d}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold text-neutro-700">
          Otro:
          <input type="number" min="1" max="365" step="1" inputMode="numeric" aria-label="Días de rotación" value={dias}
            onChange={e => setDias(e.target.value)} className="input h-11 w-28" />
          días
        </label>
        {error && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}
      </div>
    </Modal>
  )
}
