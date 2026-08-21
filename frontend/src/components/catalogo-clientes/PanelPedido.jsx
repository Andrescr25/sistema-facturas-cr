import { useState } from 'react'
import { X, Loader2, AlertCircle, CheckCircle2, LogIn } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatearColones } from '../../utils/catalogoClientesUtils'
import { usePortalCliente } from '../../contexts/PortalClienteContext'
import apiPortal from '../../services/apiPortal'

/**
 * El pedido, antes de enviarlo.
 *
 * El pedido entra al sistema: queda registrado con su precio congelado y
 * alguien de la casa lo convierte en factura. Enviarlo exige cuenta; mirar
 * el catálogo, no.
 *
 * Las sugerencias ("Suele faltar") viven en PanelSugerencias, afuera: acá
 * adentro se metían entre los productos y el total, justo donde el cliente
 * quiere revisar lo que va a comprar sin nada en el medio.
 */
export default function PanelPedido({ resumen, onCambiar, onVaciar, onCerrar, onEnviado, onAgregar }) {
  const { cliente } = usePortalCliente()
  const [observaciones, setObservaciones] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(null)

  const enviar = async () => {
    setEnviando(true)
    setError('')
    try {
      // No se mandan líneas: el pedido se arma con el carrito que ya está
      // guardado en el servidor. El navegador no participa en decidir qué se
      // pide ni a qué precio.
      const { data } = await apiPortal.post('/portal/pedidos', {
        observaciones: observaciones.trim() || null
      })
      setEnviado(data.data)
      onEnviado?.()
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar el pedido. Intentá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="bg-white w-full sm:w-[26rem] sm:rounded-3xl rounded-t-3xl max-h-[70vh] sm:max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-extrabold text-gray-900">{enviado ? 'Pedido enviado' : 'Su pedido'}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {enviado ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 size={44} className="text-emerald-600 mx-auto" />
            <p className="font-bold text-gray-900">Pedido #{enviado.id} recibido</p>
            <p className="text-sm text-gray-500">
              Total {formatearColones(enviado.total)}. Lo estamos revisando y le confirmamos con la factura.
            </p>
            <Link to="/portal/pedidos" className="inline-block text-sm font-bold text-emerald-700 hover:underline">
              Ver sus pedidos
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto p-4 space-y-3 flex-1">
              {resumen.lineas.map(({ producto, cantidad }) => (
                <div key={producto.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-900 truncate">{producto.nombre}</p>
                    <p className="text-xs text-gray-400">{cantidad} × {formatearColones(producto.precio)}</p>
                  </div>
                  <p className="text-sm font-extrabold text-gray-900 shrink-0">
                    {formatearColones(cantidad * producto.precio)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onCambiar(producto, 0)}
                    aria-label={`Quitar ${producto.nombre}`}
                    className="p-1 text-gray-300 hover:text-red-600 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 p-4 space-y-3">
              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Alguna nota para el pedido (opcional)"
                className="w-full px-3 py-2.5 border-2 border-gray-200 focus:border-emerald-500 rounded-xl text-sm font-semibold focus:outline-none"
              />

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Total</span>
                <span className="text-xl font-extrabold text-gray-900">{formatearColones(resumen.total)}</span>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-150 rounded-2xl px-3 py-2.5">
                  <AlertCircle size={15} className="text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-semibold">{error}</p>
                </div>
              )}

              {cliente ? (
                <button
                  type="button"
                  onClick={enviar}
                  disabled={enviando}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : null}
                  Enviar pedido
                </button>
              ) : (
                <div className="space-y-2">
                  <Link
                    to="/portal/ingresar"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                  >
                    <LogIn size={16} />
                    Entrar para enviar el pedido
                  </Link>
                  <p className="text-[11px] text-gray-400 text-center">
                    ¿No tiene cuenta? Solicítenos el enlace para crearla.
                  </p>
                </div>
              )}

              <button type="button" onClick={onVaciar} className="w-full text-xs text-gray-400 hover:text-gray-600 font-semibold">
                Vaciar pedido
              </button>
            </div>
          </>
        )}
    </div>
  )
}
