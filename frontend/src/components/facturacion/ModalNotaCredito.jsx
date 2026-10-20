import { useState } from 'react'
import { Check, ListChecks, Undo2 } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import Contador from '../ui/Contador'
import { colones, colonesExacto } from '../../utils/colones'
import { acreditadoDe, num } from '../../utils/facturaVista'
import { MOTIVOS_NOTA } from '../../utils/notaCreditoTexto'

/**
 * Una nota de crédito contra una factura.
 *
 * Se acredita lo que se COBRÓ: el precio y la tarifa salen de la línea de la
 * factura, no del producto de hoy. Por eso acá solo se elige QUÉ y CUÁNTO se
 * devuelve — los montos no se tocan.
 *
 * El motivo escrito es obligatorio a propósito: de las 27 notas que hay en
 * Alegra, 4 no dicen ninguno y hoy nadie sabe por qué se hicieron.
 *
 * EL DISEÑO (2026-10-20, el usuario: «haz el modal de nota crédito más
 * acorde al sistema»). Era el contenido pegado a los bordes, chips chicos,
 * un campo de número suelto por línea y botones genéricos en un azul que no
 * es del sistema. Ahora son tres pasos con aire —motivo, por qué, qué se
 * devuelve—, el contador de la factura (ui/Contador) con tope en lo
 * facturado, lo que acredita cada línea, y abajo, siempre a la vista, el
 * total y los botones del sistema.
 */
export default function ModalNotaCredito({ factura, onCerrar, onCrear }) {
  const lineas = factura.lineas || []
  const [motivo, setMotivo] = useState('devolucion')
  const [texto, setTexto] = useState('')
  const [cantidades, setCantidades] = useState(Object.fromEntries(lineas.map(l => [l.numeroLinea, 0])))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const elegidas = lineas
    .map(l => ({ ...l, devolver: num(cantidades[l.numeroLinea]) }))
    .filter(l => l.devolver > 0)
  const totalNota = elegidas.reduce((s, l) => s + acreditadoDe(l, l.devolver), 0)

  // Ni menos de cero ni más de lo facturado: el servidor lo rechazaría igual.
  const cambiar = (l, valor) => setCantidades(c => ({
    ...c, [l.numeroLinea]: Math.min(num(l.cantidad), Math.max(0, num(valor)))
  }))
  const devolverTodo = () => setCantidades(Object.fromEntries(lineas.map(l => [l.numeroLinea, num(l.cantidad)])))

  const guardar = async () => {
    setError('')
    if (!texto.trim()) return setError('Escribí por qué se hace la nota.')
    if (elegidas.length === 0) return setError('Elegí qué se devuelve.')
    setGuardando(true)
    try {
      await onCrear({
        facturaId: factura.id,
        motivo,
        motivoTexto: texto.trim(),
        lineas: elegidas.map(l => ({ numeroLinea: l.numeroLinea, cantidad: l.devolver }))
      })
      onCerrar()
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo crear la nota de crédito.')
    } finally {
      setGuardando(false)
    }
  }

  const pie = (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm font-semibold text-peligro-700">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline justify-between gap-3 sm:block">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutro-500">Se acredita</p>
          <p data-total-nota className="text-2xl font-extrabold text-nota-700">{colones(totalNota)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Boton variante="secundario" tamano="lg" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton tamano="lg" icono={Undo2} cargando={guardando} disabled={elegidas.length === 0} onClick={guardar}>
            Crear nota
          </Boton>
        </div>
      </div>
    </div>
  )

  return (
    <Modal onCerrar={onCerrar} titulo="Nota de crédito" ancho="xl" pie={pie}>
      <div className="flex flex-col gap-6 p-5">
        {/* A qué factura: lo primero que se confirma antes de acreditar nada. */}
        <div className="flex items-center gap-3 rounded-2xl border border-nota-100 bg-nota-50/60 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-nota-600 ring-1 ring-nota-100">
            <Undo2 size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-neutro-900">Factura {factura.numero}</p>
            <p className="break-words text-xs text-neutro-600">
              {[factura.cliente?.nombre, `Total ${colones(factura.total)}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <Paso titulo="Motivo">
          {/* En el teléfono, dos columnas; el que queda solo ocupa las dos. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>:last-child:nth-child(odd)]:col-span-2">
            {MOTIVOS_NOTA.map(([clave, etiqueta]) => {
              const elegido = motivo === clave
              return (
                <button
                  key={clave}
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => setMotivo(clave)}
                  className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                    elegido
                      ? 'border-nota-300 bg-nota-50 text-nota-700 ring-1 ring-nota-200'
                      : 'border-neutro-200 bg-white text-neutro-600 hover:border-neutro-300 hover:bg-neutro-50'
                  }`}
                >
                  {elegido && <Check size={15} strokeWidth={3} />}
                  {etiqueta}
                </button>
              )
            })}
          </div>
        </Paso>

        <Paso titulo="¿Por qué?" ayuda="Queda escrito en la nota y en su PDF.">
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Devolvió 2 unidades por mal estado…"
            maxLength={120}
            aria-label="Por qué se hace la nota"
            className="input min-h-12 w-full rounded-xl border border-neutro-300 text-base focus:border-primario-500"
          />
          <p className="mt-1 text-right text-[11px] text-neutro-400">{texto.length}/120</p>
        </Paso>

        <Paso
          titulo="¿Qué se devuelve?"
          accion={<Boton variante="nota" tamano="sm" icono={ListChecks} onClick={devolverTodo}>Devolver todo</Boton>}
        >
          <ul className="flex flex-col gap-2">
            {lineas.map(l => {
              const devolver = num(cantidades[l.numeroLinea])
              return (
                <li
                  key={l.numeroLinea}
                  data-linea-nota={l.numeroLinea}
                  className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors ${
                    devolver > 0 ? 'border-nota-300 bg-nota-50/40' : 'border-neutro-200 bg-white'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold leading-snug text-neutro-900">{l.nombre}</p>
                    <p className="mt-0.5 text-xs text-neutro-500">
                      {l.cantidad} × {colonesExacto(l.precioUnitario)}
                      {num(l.descuentoPorcentaje) > 0 && <span className="text-alerta-600"> −{l.descuentoPorcentaje} %</span>}
                      {' · '}IVA {num(l.tarifa)} %
                    </p>
                    {devolver > 0 && (
                      <p className="mt-1 text-xs font-bold text-nota-700">Acredita {colones(acreditadoDe(l, devolver))}</p>
                    )}
                  </div>
                  <Contador
                    valor={cantidades[l.numeroLinea] ?? 0}
                    min={0}
                    max={num(l.cantidad)}
                    onCambiar={(v) => cambiar(l, v)}
                    etiqueta={`Unidades de ${l.nombre} que se devuelven`}
                  />
                </li>
              )
            })}
          </ul>
        </Paso>
      </div>
    </Modal>
  )
}

/** Un paso del formulario: su título, una ayuda corta si hace falta y lo que se elige. */
function Paso({ titulo, ayuda, accion, children }) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutro-600">{titulo}</h3>
          {ayuda && <p className="text-xs text-neutro-500">{ayuda}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  )
}
