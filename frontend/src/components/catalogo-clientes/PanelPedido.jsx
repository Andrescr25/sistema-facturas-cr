import SelectorCiclo, { textoCiclo } from '../SelectorCiclo'
import { useState } from 'react'
import { X, Loader2, AlertCircle, Check, LogIn, Package } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatearColones } from '../../utils/catalogoClientesUtils'
import { usePortalCliente } from '../../contexts/PortalClienteContext'
import SeguimientoPedido from './SeguimientoPedido'

/**
 * El pedido, antes y después de enviarlo.
 *
 * El pedido entra al sistema: queda registrado con su precio congelado y
 * alguien de la casa lo convierte en factura. Enviarlo exige cuenta; mirar
 * el catálogo, no.
 *
 * Las sugerencias ("Suele faltar") viven en PanelSugerencias, afuera: acá
 * adentro se metían entre los productos y el total, justo donde el cliente
 * quiere revisar lo que va a comprar sin nada en el medio.
 *
 * El envío en sí (la llamada, el estado) vive en ModalPedido: el resultado
 * cambia a los dos paneles, no solo a este. Acá solo se dibuja.
 */
export default function PanelPedido({
  resumen, onCambiar, onVaciar, onCerrar,
  enviando, enviado, error, onEnviar, ciclos = [], cicloId, setCicloId, cargandoCiclos, errorCiclos
}) {
  const { cliente } = usePortalCliente()
  const [observaciones, setObservaciones] = useState('')

  const vacio = resumen.lineas.length === 0

  return (
    <div className="bg-white w-full sm:w-[26rem] sm:rounded-3xl rounded-t-3xl max-h-[70vh] sm:max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-neutro-100">
          <h2 className="font-extrabold text-neutro-900">{enviado ? 'Pedido enviado' : 'Su pedido'}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 text-neutro-400 hover:text-neutro-700">
            <X size={20} />
          </button>
        </div>

        {enviado ? (
          <div className="fade-in p-6 space-y-4 overflow-y-auto">
            <div className="text-center space-y-2">
              {/* check-pop ya existe en index.css; se anula solo con
                  prefers-reduced-motion. */}
              <span className="check-pop mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cliente-600 text-white">
                <Check size={30} strokeWidth={3} />
              </span>
              <p className="font-extrabold text-neutro-900">Pedido #{enviado.id} recibido</p>
              <p className="text-sm text-neutro-500">{formatearColones(enviado.total)}</p>
              <p className="text-xs font-semibold text-cliente-700">{textoCiclo(enviado.ciclo)}{enviado.anticipado ? ' · Pedido anticipado' : ''}</p>
            </div>

            {/* La línea de tiempo desde el minuto cero: el cliente ve qué
                sigue en vez de quedarse con un "gracias" y nada más. */}
            <div className="rounded-2xl bg-neutro-50 p-3.5">
              <SeguimientoPedido
                etapa="en_revision"
                seguimiento={[
                  { clave: 'en_revision', alcanzada: true, fecha: enviado.creadoEn || new Date().toISOString() },
                  { clave: 'en_preparacion', alcanzada: false, fecha: null },
                  { clave: 'listo_para_envio', alcanzada: false, fecha: null }
                ]}
              />
            </div>

            <Link
              to="/portal/pedidos"
              className="block w-full rounded-xl bg-neutro-900 py-3 text-center font-bold text-white transition-colors hover:bg-neutro-800"
            >
              Ver mis pedidos
            </Link>
          </div>
        ) : vacio ? (
          <div className="p-10 text-center text-neutro-400 flex flex-col items-center gap-3">
            <Package size={34} className="text-neutro-200" />
            <p className="text-sm">Su pedido está vacío.</p>
            <button type="button" onClick={onCerrar} className="text-sm font-bold text-cliente-700 hover:underline">
              Seguir viendo el catálogo
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto p-4 space-y-3 flex-1">
              {resumen.lineas.map(({ producto, cantidad }) => (
                <div key={producto.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-neutro-900 truncate">{producto.nombre}</p>
                    <p className="text-xs text-neutro-400">{cantidad} × {formatearColones(producto.precio)}</p>
                  </div>
                  <p className="text-sm font-extrabold text-neutro-900 shrink-0">
                    {formatearColones(cantidad * producto.precio)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onCambiar(producto, 0)}
                    aria-label={`Quitar ${producto.nombre}`}
                    className="p-1 text-neutro-300 hover:text-peligro-600 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-neutro-100 p-4 space-y-3">
              {cliente && <SelectorCiclo ciclos={ciclos} valor={cicloId} onChange={setCicloId} cargando={cargandoCiclos} error={errorCiclos} disabled={enviando} />}
              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Alguna nota para el pedido (opcional)"
                disabled={enviando}
                className="w-full px-3 py-2.5 border-2 border-neutro-200 focus:border-cliente-500 rounded-xl text-sm font-semibold focus:outline-none disabled:bg-neutro-50"
              />

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-neutro-400">Total</span>
                <span className="text-xl font-extrabold text-neutro-900">{formatearColones(resumen.total)}</span>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-peligro-50 border border-peligro-200 rounded-2xl px-3 py-2.5">
                  <AlertCircle size={15} className="text-peligro-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-peligro-700 font-semibold">{error}</p>
                </div>
              )}

              {cliente ? (
                <button
                  type="button"
                  onClick={() => onEnviar(observaciones)}
                  disabled={enviando || cargandoCiclos || Boolean(errorCiclos) || !cicloId}
                  className="w-full bg-cliente-600 hover:bg-cliente-700 disabled:bg-cliente-600/70 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  {/* El texto cambia además del spinner: antes solo aparecía
                      la rueda y no se notaba que estuviera pasando algo. */}
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : null}
                  {enviando ? 'Enviando…' : 'Enviar pedido'}
                </button>
              ) : (
                <div className="space-y-2">
                  <Link
                    to="/portal/ingresar"
                    className="w-full bg-cliente-600 hover:bg-cliente-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                  >
                    <LogIn size={16} />
                    Entrar para enviar el pedido
                  </Link>
                  <p className="text-[11px] text-neutro-400 text-center">
                    ¿No tiene cuenta? Solicítenos el enlace para crearla.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={onVaciar}
                disabled={enviando}
                className="w-full text-xs text-neutro-400 hover:text-neutro-600 font-semibold disabled:opacity-40"
              >
                Vaciar pedido
              </button>
            </div>
          </>
        )}
    </div>
  )
}
