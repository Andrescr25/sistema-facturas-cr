import { useState } from 'react'
import { Loader2, Undo2 } from 'lucide-react'
import Modal from '../ui/Modal'
import { colones } from '../../utils/colones'

/**
 * Una nota de crédito contra una factura.
 *
 * Se acredita lo que se COBRÓ: el precio y la tarifa salen de la línea de la
 * factura, no del producto de hoy. Por eso acá solo se elige QUÉ y CUÁNTO se
 * devuelve — los montos no se tocan.
 *
 * El motivo escrito es obligatorio a propósito: de las 27 notas que hay en
 * Alegra, 4 no dicen ninguno y hoy nadie sabe por qué se hicieron.
 */

const MOTIVOS = [
  { clave: 'devolucion', etiqueta: 'Devolución' },
  { clave: 'error', etiqueta: 'Error en la factura' },
  { clave: 'anulacion', etiqueta: 'Anulación' },
  { clave: 'descuento', etiqueta: 'Descuento posterior' },
  { clave: 'otro', etiqueta: 'Otro' }
]

export default function ModalNotaCredito({ factura, onCerrar, onCrear }) {
  const [motivo, setMotivo] = useState('devolucion')
  const [texto, setTexto] = useState('')
  const [cantidades, setCantidades] = useState(
    Object.fromEntries((factura.lineas || []).map(l => [l.numeroLinea, 0]))
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const lineasElegidas = (factura.lineas || [])
    .map(l => ({ ...l, devolver: Number(cantidades[l.numeroLinea]) || 0 }))
    .filter(l => l.devolver > 0)

  // El monto se calcula con el precio y la tarifa DE LA FACTURA, igual que lo
  // hace el servidor: lo que se muestra acá tiene que ser lo que va a salir.
  const totalNota = lineasElegidas.reduce((s, l) => {
    const base = l.devolver * l.precioUnitario * (1 - (l.descuentoPorcentaje || 0) / 100)
    return s + base * (1 + (l.tarifa || 0) / 100)
  }, 0)

  const devolverTodo = () => setCantidades(
    Object.fromEntries((factura.lineas || []).map(l => [l.numeroLinea, l.cantidad]))
  )

  const guardar = async () => {
    setError('')
    if (!texto.trim()) return setError('Escribí por qué se hace la nota.')
    if (lineasElegidas.length === 0) return setError('Elegí qué se devuelve.')
    setGuardando(true)
    try {
      await onCrear({
        facturaId: factura.id,
        motivo,
        motivoTexto: texto.trim(),
        lineas: lineasElegidas.map(l => ({ numeroLinea: l.numeroLinea, cantidad: l.devolver }))
      })
      onCerrar()
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo crear la nota de crédito.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal onCerrar={onCerrar} titulo={`Nota de crédito · ${factura.numero}`} ancho="xl">
      <div className="flex flex-col gap-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutro-500">Motivo</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {MOTIVOS.map(m => (
              <button
                key={m.clave}
                type="button"
                onClick={() => setMotivo(m.clave)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                  motivo === m.clave
                    ? 'border-nota-300 bg-nota-50 text-nota-700'
                    : 'border-neutro-200 bg-white text-neutro-600 hover:border-neutro-300'
                }`}
              >
                {m.etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutro-500">
            ¿Por qué? (queda escrito en la nota)
          </span>
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Devolvió 2 unidades por mal estado…"
            maxLength={120}
            className="input mt-1.5 w-full"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutro-500">
              ¿Qué se devuelve?
            </span>
            <button type="button" onClick={devolverTodo} className="text-xs font-semibold text-primario-600 hover:underline">
              Devolver todo
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            {(factura.lineas || []).map(l => (
              <div key={l.numeroLinea} className="flex items-center gap-3 rounded-xl border border-neutro-200 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutro-800">{l.nombre}</p>
                  <p className="text-xs text-neutro-500">
                    {l.cantidad} × {colones(l.precioUnitario)} · IVA {l.tarifa}%
                  </p>
                </div>
                <input
                  type="number"
                  min="0"
                  max={l.cantidad}
                  step="1"
                  value={cantidades[l.numeroLinea] ?? 0}
                  onChange={(e) => setCantidades(c => ({ ...c, [l.numeroLinea]: e.target.value }))}
                  className="input w-20 text-center"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-baseline justify-between border-t-2 border-neutro-200 pt-3">
          <span className="font-bold text-neutro-900">Se acredita</span>
          <span className="text-xl font-extrabold text-nota-700">{colones(totalNota)}</span>
        </div>

        {error && <p className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onCerrar} className="btn btn-outline flex-1">Cancelar</button>
          <button
            onClick={guardar}
            disabled={guardando || lineasElegidas.length === 0}
            className="btn btn-primary flex flex-1 items-center justify-center gap-2 disabled:opacity-50"
          >
            {guardando ? <Loader2 size={18} className="animate-spin" /> : <Undo2 size={18} />}
            {guardando ? 'Creando…' : 'Crear nota'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
