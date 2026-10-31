import { useState } from 'react'
import { Ban, Receipt } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import { useAuth } from '../../contexts/AuthContext'
import { puedeAccion } from '../../utils/modulos'
import { colones } from '../../utils/colones'
import { fechaEnPalabras } from '../../utils/fechaCR'

const corta = (f) => fechaEnPalabras(f, { day: 'numeric', month: 'short' })
const QUE = {
  quincena: (p) => p.periodoNombre,
  ajuste: (p) => `Ajuste de la ${p.periodoNombre}`,
  gasolina: (p) => `Gasolina · ${p.dias.length === 1 ? corta(p.dias[0]) : `${p.dias.length} días`}`
}

/**
 * Lo que se le ha pagado (2026-10-30), con los anulados tachados. «Anular» solo
 * para el administrador: es plata que ya salió de caja (lo hace valer el servidor).
 */
export default function PagosEmpleado({ pagos, onAnular }) {
  const { usuario } = useAuth()
  const puedeAnular = Boolean(onAnular) && puedeAccion(usuario, 'anular-pago-empleado')
  const [anulando, setAnulando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const confirmar = async () => {
    setGuardando(true); setError('')
    try { await onAnular(anulando.id, motivo); setAnulando(null); setMotivo('') } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <section aria-label="Pagos" className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold text-neutro-900"><Receipt size={18} className="text-primario-500" />Pagos</h2>
      {pagos.length === 0 && <p className="card p-4 text-sm text-neutro-500">Todavía no hay pagos registrados.</p>}
      <ul className="space-y-2">
        {pagos.map(p => (
          <li key={p.id} className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${p.anulado ? 'bg-neutro-50' : ''}`}>
            <div className="min-w-0">
              <p className={`font-bold text-neutro-900 ${p.anulado ? 'line-through' : ''}`}>{QUE[p.concepto](p)}</p>
              <p className="text-sm text-neutro-500">{corta(p.fecha)} · {p.metodo}{p.referencia ? ` · ${p.referencia}` : ''}{p.registrado_por ? ` · ${p.registrado_por}` : ''}</p>
              {p.anulado && <p className="text-sm text-peligro-700">Anulado: {p.motivo_anulacion}</p>}
            </div>
            <div className="flex items-center gap-3">
              {p.anulado ? <Insignia tono="peligro">Anulado</Insignia> : <span className="text-lg font-bold text-neutro-900">{colones(p.monto)}</span>}
              {puedeAnular && !p.anulado && <Boton tamano="sm" variante="secundario" icono={Ban} onClick={() => { setAnulando(p); setError('') }}>Anular</Boton>}
            </div>
          </li>
        ))}
      </ul>
      {anulando && (
        <Modal titulo="Anular pago" hoja={false} onCerrar={guardando ? () => {} : () => setAnulando(null)} pie={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={() => setAnulando(null)} disabled={guardando}>Cancelar</Boton>
            <Boton variante="peligro" icono={Ban} onClick={confirmar} cargando={guardando} disabled={motivo.trim().length < 3}>Anular pago</Boton>
          </div>
        )}>
          <div className="space-y-3 p-4 sm:p-5">
            <p className="text-sm text-neutro-700">{QUE[anulando.concepto](anulando)} · {colones(anulando.monto)}. Deja de salir de caja y lo que cubría vuelve a quedar pendiente.</p>
            <textarea aria-label="Motivo" value={motivo} maxLength={300} rows={2} onChange={e => setMotivo(e.target.value)} placeholder="Por qué se anula" className="input w-full text-sm" />
            {error && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}
          </div>
        </Modal>
      )}
    </section>
  )
}
