import { useState } from 'react'
import { X, Send, Trash2, CheckCircle2, Clock, AlertTriangle, Loader2, WifiOff } from 'lucide-react'

/**
 * El pedido que el agente está armando, y la cola de los que ya envió.
 *
 * POR QUÉ LA COLA SE VE
 * El agente trabaja sin señal la mayor parte del tiempo. Si los pedidos se
 * fueran acumulando en silencio, no tendría forma de saber cuáles llegaron y
 * cuáles no — y se enteraría cuando el cliente reclame que nunca le llegó el
 * producto. Acá cada pedido dice en qué estado está, con su fecha.
 *
 * Un pedido NO desaparece de esta lista hasta que el servidor confirma que lo
 * tiene. Ver "sin enviar" es incómodo a propósito: es información que el
 * agente necesita antes de irse del local.
 */

const ESTADOS = {
  en_dispositivo: { texto: 'Sin enviar', Icono: Clock, clase: 'cola-pendiente' },
  enviando: { texto: 'Enviando...', Icono: Loader2, clase: 'cola-enviando' },
  confirmado: { texto: 'Recibido', Icono: CheckCircle2, clase: 'cola-ok' },
  rechazado: { texto: 'Rechazado', Icono: AlertTriangle, clase: 'cola-error' }
}

// es-CR separa los miles con un espacio duro (U+00A0) y "₡7 484" se lee
// como dos numeros. Se escribe \u00A0 y no el caracter en si: literal es
// invisible en el editor y cualquiera lo borra sin darse cuenta.
const colones = (n) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR').replace(/\u00A0/g, '.')}`

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
    <div className="pedido-overlay" role="dialog" aria-modal="true" aria-label="Pedido">
      <div className="pedido-fondo" onClick={onCerrar} />

      <div className="pedido-panel">
        <div className="pedido-encabezado">
          <div>
            <h2>Pedido</h2>
            <p>{clienteActivo?.nombre || 'Sin cliente elegido'}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"><X size={22} /></button>
        </div>

        <div className="pedido-cuerpo">
          {lineas.length === 0 ? (
            <p className="pedido-vacio">Todavía no agregó productos.</p>
          ) : (
            <>
              {lineas.map((l) => (
                <div key={l.alegraItemId} className="pedido-linea">
                  <div className="pedido-linea-info">
                    <span className="pedido-linea-nombre">{l.nombre}</span>
                    <span className="pedido-linea-detalle">
                      {l.cantidad} × {colones(l.precioReferencia)}
                    </span>
                  </div>
                  <span className="pedido-linea-total">{colones(l.cantidad * l.precioReferencia)}</span>
                  <button
                    type="button"
                    aria-label={`Quitar ${l.nombre}`}
                    onClick={() => onCambiar({ id: l.alegraItemId }, 0)}
                  ><X size={16} /></button>
                </div>
              ))}

              <input
                type="text"
                className="pedido-nota"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Alguna nota para el pedido (opcional)"
              />

              <div className="pedido-total">
                <span>Total aproximado</span>
                <strong>{colones(totalReferencia)}</strong>
              </div>
              {/* El precio final lo pone el servidor con el catálogo de hoy;
                  esta tablet puede tener uno de hace días. Decirlo evita que
                  el agente le prometa un precio al cliente y no coincida. */}
              <p className="pedido-aviso-precio">
                El total definitivo se calcula al recibirlo, con los precios de hoy.
              </p>

              {error && <p className="pedido-error">{error}</p>}

              <button type="button" className="pedido-enviar" onClick={enviar} disabled={enviando}>
                {enviando ? <Loader2 size={18} className="girando" /> : <Send size={18} />}
                {hayInternet ? 'Enviar pedido' : 'Guardar pedido (sin señal)'}
              </button>
              <button type="button" className="pedido-vaciar" onClick={onVaciar}>
                <Trash2 size={14} /> Vaciar
              </button>
            </>
          )}

          {cola.length > 0 && (
            <div className="cola-seccion">
              <div className="cola-encabezado">
                <h3>Pedidos enviados</h3>
                {!hayInternet && (
                  <span className="cola-sin-senal"><WifiOff size={13} /> sin señal</span>
                )}
                {hayInternet && cola.some(p => p.estado === 'en_dispositivo') && (
                  <button type="button" onClick={onSincronizar} className="cola-reintentar">
                    Enviar pendientes
                  </button>
                )}
              </div>

              {cola.map((p) => {
                const e = ESTADOS[p.estado] || ESTADOS.en_dispositivo
                const Icono = e.Icono
                return (
                  <div key={p.clave} className={`cola-item ${e.clase}`}>
                    <Icono size={16} className={p.estado === 'enviando' ? 'girando' : ''} />
                    <div className="cola-item-info">
                      <span className="cola-item-cliente">{p.clienteNombre || 'Cliente'}</span>
                      <span className="cola-item-detalle">
                        {p.lineas?.length || 0} producto(s) · {colones(p.totalReferencia)}
                        {p.pedidoId ? ` · pedido #${p.pedidoId}` : ''}
                      </span>
                      {p.detalle && <span className="cola-item-nota">{p.detalle}</span>}
                    </div>
                    <span className="cola-item-estado">{e.texto}</span>
                    {p.estado === 'confirmado' && (
                      <button type="button" aria-label="Quitar de la lista"
                        onClick={() => onArchivar(p.clave)}><X size={14} /></button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
