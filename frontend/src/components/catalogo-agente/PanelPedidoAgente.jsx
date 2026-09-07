import { useState } from 'react'
import { X, Send, Trash2, CheckCircle2, Clock, AlertTriangle, Loader2, WifiOff, ShoppingCart } from 'lucide-react'
import { colones } from '../../utils/colones'

/**
 * El pedido que el agente está armando, y la cola de los que ya envió.
 *
 * POR QUÉ LA COLA SE VE
 * El agente trabaja sin señal la mayor parte del tiempo. Si los pedidos se
 * fueran acumulando en silencio, no tendría forma de saber cuáles llegaron y
 * cuáles no — y se enteraría cuando el cliente reclame que nunca le llegó el
 * producto. Acá cada pedido dice en qué estado está.
 *
 * Un pedido NO desaparece de esta lista hasta que el servidor confirma que lo
 * tiene. Ver "sin enviar" es incómodo a propósito: es información que el
 * agente necesita antes de irse del local.
 */

const ESTADOS = {
  en_dispositivo: { texto: 'Sin enviar', Icono: Clock,        anillo: 'ring-alerta-200', fondo: 'bg-alerta-50',  texto_: 'text-alerta-700' },
  enviando:       { texto: 'Enviando…',  Icono: Loader2,      anillo: 'ring-primario-200', fondo: 'bg-primario-50', texto_: 'text-primario-700' },
  confirmado:     { texto: 'Recibido',   Icono: CheckCircle2, anillo: 'ring-exito-200',  fondo: 'bg-exito-50',   texto_: 'text-exito-700' },
  rechazado:      { texto: 'Rechazado',  Icono: AlertTriangle, anillo: 'ring-peligro-200', fondo: 'bg-peligro-50', texto_: 'text-peligro-700' }
}

export default function PanelPedidoAgente({
  abierto, onCerrar, lineas, totalReferencia, onCambiar, onVaciar,
  cola, onEnviar, onSincronizar, onArchivar, enviando, clienteActivo, hayInternet
}) {
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState('')

  if (!abierto) return null

  const enviar = async () => {
    setError('')
    try {
      await onEnviar({ observaciones: observaciones.trim() || null })
      setObservaciones('')
    } catch (e) {
      setError(e.message || 'No se pudo guardar el pedido.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Pedido">
      <div className="absolute inset-0 bg-primario-950/50 backdrop-blur-sm" onClick={onCerrar} />

      <div className="relative flex h-full w-full flex-col bg-neutro-50 sm:max-w-md">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutro-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-neutro-900">Pedido</h2>
            <p className="truncate text-xs text-neutro-400">
              {clienteActivo?.n || clienteActivo?.nombre || 'Sin cliente elegido'}
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutro-400 hover:bg-neutro-100">
            <X size={19} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {lineas.length === 0 ? (
            <div className="py-14 text-center">
              <ShoppingCart size={30} className="mx-auto text-neutro-200" />
              <p className="mt-3 text-sm font-semibold text-neutro-500">Todavía no agregó productos.</p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-neutro-200">
                {lineas.map((l) => (
                  <div key={l.alegraItemId}
                    className="flex items-center gap-2 border-b border-neutro-100 px-3 py-2.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-neutro-900">{l.nombre}</p>
                      <p className="text-[11px] text-neutro-400">
                        {l.cantidad} × {colones(l.precioReferencia)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-extrabold text-neutro-900">
                      {colones(l.cantidad * l.precioReferencia)}
                    </span>
                    <button type="button" aria-label={`Quitar ${l.nombre}`}
                      onClick={() => onCambiar({ id: l.alegraItemId }, 0)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutro-300 hover:bg-peligro-50 hover:text-peligro-600">
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Alguna nota para el pedido (opcional)"
                aria-label="Nota del pedido"
                className="mt-3 h-11 w-full rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-neutro-200 placeholder:font-normal placeholder:text-neutro-400 focus:outline-none focus:ring-2 focus:ring-acento-400"
              />

              <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-neutro-200">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold text-neutro-500">Total aproximado</span>
                  <strong className="text-xl font-extrabold text-neutro-900">{colones(totalReferencia)}</strong>
                </div>
                {/* El precio final lo pone el servidor con el catálogo de hoy;
                    esta tablet puede tener uno de hace días. Decirlo evita que
                    el agente le prometa un precio al cliente y no coincida. */}
                <p className="mt-1 text-[11px] leading-tight text-neutro-400">
                  El total definitivo se calcula al recibirlo, con los precios de hoy.
                </p>
              </div>

              {error && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-peligro-50 px-3 py-2.5 ring-1 ring-peligro-200">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-peligro-600" />
                  <p className="text-xs font-semibold text-peligro-800">{error}</p>
                </div>
              )}

              <button type="button" onClick={enviar} disabled={enviando}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primario-800 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-60">
                {enviando ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                {hayInternet ? 'Enviar pedido' : 'Guardar pedido (sin señal)'}
              </button>
              <button type="button" onClick={onVaciar}
                className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-neutro-400 hover:bg-neutro-100 hover:text-peligro-600">
                <Trash2 size={13} /> Vaciar
              </button>
            </>
          )}

          {cola.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-neutro-400">
                  Pedidos enviados
                </h3>
                {!hayInternet ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-alerta-700">
                    <WifiOff size={12} /> sin señal
                  </span>
                ) : cola.some((p) => p.estado === 'en_dispositivo') ? (
                  <button type="button" onClick={onSincronizar}
                    className="rounded-lg bg-primario-800 px-2.5 py-1 text-[11px] font-bold text-white">
                    Enviar pendientes
                  </button>
                ) : null}
              </div>

              <div className="space-y-1.5">
                {cola.map((p) => {
                  const e = ESTADOS[p.estado] || ESTADOS.en_dispositivo
                  const Icono = e.Icono
                  return (
                    <div key={p.clave}
                      className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 ring-1 ${e.fondo} ${e.anillo}`}>
                      <Icono size={15} className={`mt-0.5 shrink-0 ${e.texto_} ${p.estado === 'enviando' ? 'animate-spin' : ''}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-bold text-neutro-900">
                          {p.clienteNombre || 'Cliente'}
                        </p>
                        <p className="text-[11px] text-neutro-500">
                          {p.lineas?.length || 0} producto(s) · {colones(p.totalReferencia)}
                          {p.pedidoId ? ` · #${p.pedidoId}` : ''}
                        </p>
                        {p.detalle && <p className="mt-0.5 text-[11px] text-neutro-400">{p.detalle}</p>}
                      </div>
                      <span className={`shrink-0 text-[11px] font-bold ${e.texto_}`}>{e.texto}</span>
                      {p.estado === 'confirmado' && (
                        <button type="button" aria-label="Quitar de la lista"
                          onClick={() => onArchivar(p.clave)}
                          className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutro-300 hover:text-neutro-600">
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
