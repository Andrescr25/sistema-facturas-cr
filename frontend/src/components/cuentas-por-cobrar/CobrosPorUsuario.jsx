import { useState } from 'react'
import { Users, Banknote, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { recibirEfectivo } from '../../services/cuentasPorCobrarService'
import { formatCurrency } from '../../utils/cuentasPorCobrarUtils'

/**
 * Cuánto cobró cada usuario en el día y el efectivo que entregó (migración 071).
 *
 * El usuario, sobre el agente de ventas (2026-10-29): «cuánto dinero recogió
 * por usuario y todo más acomodado a cierre de caja». Quien está en caja anota
 * lo que le entregó cada cobrador antes de cerrar el día; lo cobrado se
 * congela en ese momento y queda la diferencia. Con la caja cerrada ya no se
 * anota: se reabre, como cualquier corrección del día.
 */
export default function CobrosPorUsuario({ fecha, porUsuario, cerrada, onCambio }) {
  if (!porUsuario?.length) return null
  return (
    <section aria-label="Cobros por usuario" className="card space-y-4 p-5">
      <h3 className="flex items-center gap-2 font-bold text-neutro-900"><Users size={18} className="text-primario-500" />Cobros por usuario</h3>
      <div className="space-y-3">
        {porUsuario.map(u => <FilaCobrador key={u.usuarioId ?? 'sin'} fecha={fecha} u={u} cerrada={cerrada} onCambio={onCambio} />)}
      </div>
    </section>
  )
}

function FilaCobrador({ fecha, u, cerrada, onCambio }) {
  const [abierta, setAbierta] = useState(false)
  const [entregado, setEntregado] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const r = u.rendicion

  const recibir = async () => {
    setGuardando(true); setError('')
    try {
      await recibirEfectivo({ fecha, usuarioId: u.usuarioId, efectivoEntregado: entregado, observaciones })
      setAbierta(false)
      onCambio()
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo anotar la entrega.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-2xl border border-neutro-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-bold text-neutro-900">{u.nombre}</p>
          <p className="text-sm text-neutro-500">{u.cantidad} cobro{u.cantidad === 1 ? '' : 's'} · {formatCurrency(u.total)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutro-500">Efectivo</p>
          <p className="text-lg font-extrabold text-neutro-900">{formatCurrency(u.efectivo)}</p>
        </div>
      </div>
      {u.otros.length > 0 && (
        <p className="mt-1 text-xs text-neutro-500">{u.otros.map(o => `${o.metodo} ${formatCurrency(o.monto)}`).join(' · ')}</p>
      )}

      {r ? (
        <p className={`mt-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${r.diferencia === 0 ? 'bg-exito-50 text-exito-800' : 'bg-alerta-50 text-alerta-800'}`}>
          {r.diferencia === 0 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          Entregó {formatCurrency(r.efectivoEntregado)}
          {r.diferencia !== 0 && ` · ${r.diferencia > 0 ? 'sobran' : 'faltan'} ${formatCurrency(Math.abs(r.diferencia))}`}
          {r.recibidoPor && <span className="font-normal">· recibió {r.recibidoPor}</span>}
        </p>
      ) : u.usuarioId && !cerrada && (
        abierta ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
            <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={`Efectivo que entregó ${u.nombre}`} placeholder="Efectivo entregado"
              value={entregado} onChange={e => setEntregado(e.target.value)} className="input h-11 w-full" />
            <input type="text" maxLength={500} aria-label="Observaciones" placeholder="Observaciones (opcional)"
              value={observaciones} onChange={e => setObservaciones(e.target.value)} className="input h-11 w-full" />
            <button type="button" onClick={recibir} disabled={guardando || entregado === ''}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primario-600 px-4 text-sm font-bold text-white hover:bg-primario-700 disabled:opacity-50">
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}Anotar
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAbierta(true)}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primario-200 bg-primario-50 px-3 text-sm font-bold text-primario-800 hover:bg-primario-100">
            <Banknote size={16} />Recibir efectivo
          </button>
        )
      )}
      {error && <p role="alert" className="mt-2 text-sm text-peligro-700">{error}</p>}
    </div>
  )
}
