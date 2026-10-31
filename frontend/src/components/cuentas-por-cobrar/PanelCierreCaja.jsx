import { useState } from 'react'
import { Lock, Unlock, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cerrarCaja, reabrirCaja } from '../../services/cuentasPorCobrarService'
import { formatCurrency } from '../../utils/cuentasPorCobrarUtils'
import { useAuth } from '../../contexts/AuthContext'
import { puedeAccion } from '../../utils/modulos'

// Cómo se nombra cada salida de efectivo del día (las arma cierreCaja.service).
const SALIDA = { proveedor: 'Pago a', gasto: 'Gasto:', pago_empleado: 'Planilla:' }

/**
 * Cerrar la caja del día: lo que debería haber contra lo que hay.
 *
 * "Cobros del día" responde cuánto entró. Esto responde si la caja CUADRA,
 * que es lo que hace aparecer un faltante el mismo día y no tres semanas
 * después, cuando ya nadie se acuerda de quién estuvo en la caja.
 *
 * SE CUENTA SOLO EL EFECTIVO. Lo demás —SINPE, transferencia, tarjeta— se
 * cuadra contra el banco, no contando billetes.
 *
 * Y una diferencia NO SE PUEDE GUARDAR SIN EXPLICARLA. Un faltante sin motivo
 * es un faltante; con motivo es un hecho.
 *
 * LO QUE SALIÓ DE LA CAJA YA VIENE RESTADO (migración 026): un pago a un
 * proveedor o un gasto pagado desde "Caja general" baja lo que debería haber,
 * y se muestra qué fue, para que el número se pueda explicar.
 */
function DesgloseSalidas({ cobrado, salidas }) {
  if (!salidas?.length) return null
  const total = salidas.reduce((s, x) => s + Number(x.monto || 0), 0)
  return (
    <div className="mt-3 rounded-xl border border-neutro-100 bg-neutro-50 p-3 text-sm">
      <div className="flex justify-between text-neutro-600">
        <span>Cobrado en efectivo</span><span className="font-semibold">{formatCurrency(cobrado)}</span>
      </div>
      {salidas.map((x) => (
        <div key={`${x.tipo}-${x.id}`} className="flex justify-between text-neutro-500">
          <span className="truncate pr-2">− {SALIDA[x.tipo] || 'Gasto:'} {x.descripcion}</span>
          <span>−{formatCurrency(x.monto)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-neutro-200 pt-1 font-semibold text-neutro-800">
        <span>Salió de la caja</span><span>−{formatCurrency(total)}</span>
      </div>
    </div>
  )
}

export default function PanelCierreCaja({ fecha, efectivoEsperado, efectivoCobrado, salidas, cierre, onCambio }) {
  const [contado, setContado] = useState('')
  const [motivo, setMotivo] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [reabriendo, setReabriendo] = useState(false)
  const [motivoReapertura, setMotivoReapertura] = useState('')
  // Reabrir un cierre es de administradores; cerrarlo, de quien cobra.
  const { usuario } = useAuth()
  const puedeReabrir = puedeAccion(usuario, 'reabrir-caja')

  const esperado = Number(efectivoEsperado) || 0
  const contadoNum = contado === '' ? null : Number(contado)
  const diferencia = contadoNum === null ? null : Math.round((contadoNum - esperado) * 100) / 100
  const cuadra = diferencia !== null && Math.abs(diferencia) < 1

  const guardar = async () => {
    setError('')
    if (contadoNum === null || Number.isNaN(contadoNum)) return setError('Escribí cuánto efectivo hay en la caja.')
    if (!cuadra && !motivo.trim()) {
      return setError(diferencia > 0
        ? 'Sobra plata: escribí de dónde salió.'
        : 'Falta plata: escribí qué pasó.')
    }
    setGuardando(true)
    try {
      await cerrarCaja({ fecha, efectivoContado: contadoNum, motivoDiferencia: motivo.trim() || null, observaciones })
      await onCambio()
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo cerrar la caja.')
    } finally {
      setGuardando(false)
    }
  }

  const reabrir = async () => {
    setError('')
    if (!motivoReapertura.trim()) return setError('Escribí por qué se reabre el cierre.')
    setGuardando(true)
    try {
      await reabrirCaja(fecha, motivoReapertura.trim())
      setReabriendo(false); setMotivoReapertura(''); setContado('')
      await onCambio()
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo reabrir.')
    } finally {
      setGuardando(false)
    }
  }

  // ---- El día ya está cerrado ----
  if (cierre) {
    const cerroCuadrado = Math.abs(Number(cierre.diferencia)) < 1
    return (
      <div className="card rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Lock size={16} className="text-neutro-400" />
          <span className="font-bold text-neutro-900">Caja cerrada</span>
          {cerroCuadrado ? (
            <span className="flex items-center gap-1 text-sm font-semibold text-exito-700">
              <CheckCircle2 size={15} /> Cuadró
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm font-semibold text-alerta-700">
              <AlertTriangle size={15} />
              {Number(cierre.diferencia) > 0 ? 'Sobró' : 'Faltó'} {formatCurrency(Math.abs(Number(cierre.diferencia)))}
            </span>
          )}
        </div>

        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <p className="text-neutro-500">
            Esperado <strong className="block text-neutro-800">{formatCurrency(cierre.efectivoEsperado)}</strong>
            {cierre.salidasEfectivo > 0 && (
              <span className="block text-xs">ya restados {formatCurrency(cierre.salidasEfectivo)} que salieron de la caja</span>
            )}
          </p>
          <p className="text-neutro-500">Contado <strong className="block text-neutro-800">{formatCurrency(cierre.efectivoContado)}</strong></p>
          <p className="text-neutro-500">Diferencia <strong className="block text-neutro-800">{formatCurrency(cierre.diferencia)}</strong></p>
        </div>

        {cierre.motivoDiferencia && (
          <p className="mt-2 rounded-xl bg-alerta-50 px-3 py-2 text-sm text-alerta-800">
            {cierre.motivoDiferencia}
          </p>
        )}
        {cierre.observaciones && <p className="mt-2 text-sm text-neutro-600">{cierre.observaciones}</p>}

        {!puedeReabrir ? (
          <p className="mt-4 text-sm text-neutro-500">Para reabrir este cierre hace falta un administrador.</p>
        ) : !reabriendo ? (
          <button onClick={() => setReabriendo(true)} className="btn btn-outline mt-4 flex items-center gap-2">
            <Unlock size={15} /> Reabrir
          </button>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {/* Reabrir deja rastro a propósito: un segundo conteo que pise al
                primero en silencio no prueba nada. */}
            <input
              value={motivoReapertura}
              onChange={(e) => setMotivoReapertura(e.target.value)}
              placeholder="¿Por qué se reabre? Queda anotado con tu nombre"
              className="input w-full"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setReabriendo(false)} className="btn btn-outline flex-1">Cancelar</button>
              <button onClick={reabrir} disabled={guardando} className="btn btn-primary flex-1 disabled:opacity-50">
                {guardando ? <Loader2 size={16} className="animate-spin" /> : 'Reabrir'}
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-2 rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}
      </div>
    )
  }

  // ---- Todavía sin cerrar ----
  return (
    <div className="card rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <Lock size={16} className="text-neutro-400" />
        <span className="font-bold text-neutro-900">Cerrar la caja</span>
      </div>
      <p className="mt-0.5 text-sm text-neutro-500">
        Se cuenta solo el efectivo. SINPE, transferencias y tarjetas se cuadran contra el banco.
      </p>

      <DesgloseSalidas cobrado={efectivoCobrado} salidas={salidas} />

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutro-400">Debería haber</span>
          <p className="text-lg font-bold text-neutro-900">{formatCurrency(esperado)}</p>
        </div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-neutro-400">
          Efectivo contado
          <input
            type="number" min="0" step="0.01" value={contado}
            onChange={(e) => setContado(e.target.value)}
            placeholder="0"
            className="input mt-0.5 w-full text-right text-lg font-bold"
          />
        </label>
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutro-400">Diferencia</span>
          <p className={`text-lg font-bold ${
            diferencia === null ? 'text-neutro-300'
              : cuadra ? 'text-exito-600'
              : diferencia > 0 ? 'text-alerta-600' : 'text-peligro-600'
          }`}>
            {diferencia === null ? '—' : formatCurrency(diferencia)}
          </p>
        </div>
      </div>

      {/* El motivo aparece solo cuando hace falta, y ahí es obligatorio. */}
      {diferencia !== null && !cuadra && (
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={diferencia > 0 ? '¿De dónde salió lo que sobra?' : '¿Qué pasó con lo que falta?'}
          className="input mt-3 w-full"
        />
      )}

      <input
        value={observaciones}
        onChange={(e) => setObservaciones(e.target.value)}
        placeholder="Observaciones del día (opcional)"
        className="input mt-2 w-full"
      />

      {error && <p className="mt-2 rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}

      <button
        onClick={guardar}
        disabled={guardando}
        className="btn btn-primary mt-3 flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50 sm:w-auto"
      >
        {guardando ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
        Cerrar la caja del día
      </button>
    </div>
  )
}
