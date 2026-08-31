import { useEffect, useState } from 'react'
import { X, Loader2, ImageOff, History } from 'lucide-react'
import apiPortal from '../../services/apiPortal'
import { formatearColones } from '../../utils/catalogoClientesUtils'
import { haceCuanto } from '../../utils/notasCatalogo'
import SugerenciasJuntoCon from './SugerenciasJuntoCon'
import InputCantidad from './InputCantidad'
import { useModal } from '../../hooks/useModal'

/**
 * Ficha de un producto.
 *
 * Lo que la hace distinta de un catálogo cualquiera es el bloque de
 * historial: en vez de "otros clientes lo recomiendan", dice cuántas veces
 * lo ha llevado ESTE cliente y desde cuándo. Eso es lo que reemplaza a la
 * publicidad — no hace falta convencerlo de nada, solo recordarle.
 *
 * Solo abre con sesión: sin cuenta no hay historial que mostrar y la ficha
 * pierde la mitad de su razón de ser.
 */
export default function FichaProducto({ itemId, cantidadEnCarrito, onCambiar, onCerrar }) {
  useModal(onCerrar)
  const [producto, setProducto] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    setCargando(true)
    apiPortal.get(`/portal/productos/${itemId}`)
      .then(({ data }) => { if (vigente) setProducto(data.data) })
      .catch((err) => { if (vigente) setError(err.response?.data?.message || 'No se pudo abrir el producto.') })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [itemId])

  const h = producto?.historial

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />

      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl max-h-[90vh] flex flex-col">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 p-1.5 bg-white/90 rounded-full text-neutro-500 hover:text-neutro-900"
        >
          <X size={18} />
        </button>

        {cargando ? (
          <div className="py-24 flex justify-center"><Loader2 size={26} className="animate-spin text-cliente-600" /></div>
        ) : error ? (
          <p className="py-24 text-center text-sm text-neutro-400 px-6">{error}</p>
        ) : (
          <div className="overflow-y-auto">
            <div className="sm:flex sm:gap-5 p-4 sm:p-5">
              <div className="sm:w-56 shrink-0 aspect-square bg-neutro-50 rounded-2xl flex items-center justify-center overflow-hidden relative">
                {producto.imagen ? (
                  <img src={producto.imagen} alt={producto.nombre} className="w-full h-full object-contain" />
                ) : (
                  <ImageOff size={32} className="text-neutro-200" />
                )}
                {producto.descuento > 0 && (
                  <span className="absolute top-2 left-2 bg-peligro-600 text-white text-[11px] font-extrabold px-2 py-0.5 rounded-md">
                    −{producto.descuento}%
                  </span>
                )}
              </div>

              <div className="mt-4 sm:mt-0 flex-1 min-w-0 space-y-3">
                <div>
                  <h2 className="font-extrabold text-neutro-900 leading-snug">{producto.nombre}</h2>
                  <p className="text-xs text-neutro-400 mt-0.5">
                    {producto.referencia ? `Ref. ${producto.referencia} · ` : ''}{producto.categoria}
                  </p>
                </div>

                <div>
                  {producto.precioLista && (
                    <p className="text-sm text-neutro-400 line-through leading-none">
                      {formatearColones(producto.precioLista)}
                    </p>
                  )}
                  <p className={`text-2xl font-extrabold ${producto.descuento ? 'text-peligro-600' : 'text-cliente-700'}`}>
                    {formatearColones(producto.precio)}
                  </p>
                </div>

                {h && (
                  <div className="bg-cliente-50/60 border border-cliente-200 rounded-2xl p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <History size={13} className="text-cliente-700" />
                      <p className="text-[11px] font-extrabold text-cliente-800 uppercase tracking-wide">
                        Su historial con este producto
                      </p>
                    </div>
                    <p className="text-xs text-cliente-900">
                      Lo ha llevado <strong>{h.veces} {h.veces === 1 ? 'vez' : 'veces'}</strong>
                      {h.unidades > 0 && <> · <strong>{Math.round(h.unidades)}</strong> unidades en total</>}
                    </p>
                    <p className="text-xs text-cliente-700">
                      La última vez, {haceCuanto(h.dias)}
                    </p>
                  </div>
                )}

                {cantidadEnCarrito > 0 ? (
                  <div className="flex items-center gap-2">
                    <InputCantidad
                      cantidad={cantidadEnCarrito}
                      onCambiar={(n) => onCambiar(producto, n)}
                    />
                    <span className="text-xs text-neutro-400 font-semibold">en su pedido</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onCambiar(producto, 1)}
                    className="w-full sm:w-auto px-6 h-11 rounded-xl bg-cliente-600 hover:bg-cliente-700 text-white font-bold transition-colors"
                  >
                    Agregar al pedido
                  </button>
                )}
              </div>
            </div>

            {producto.juntoCon?.length > 0 && (
              <div className="border-t border-neutro-100 p-4 sm:p-5">
                <SugerenciasJuntoCon
                  ids={[producto.id]}
                  titulo="Quienes lo llevan, también llevan"
                  onAgregar={onCambiar}
                />
              </div>
            )}
          </div>
        )}

        {/* Salida clara del modal. Antes solo estaba la X chiquita de arriba
            a la derecha, que en un teléfono es fácil no ver, y quedaba la
            duda de si lo elegido se había guardado.

            NO guarda nada: la cantidad ya se guardó sola al escribirla. Es
            solo una forma entendible de salir. Va fuera del contenedor con
            scroll para que quede siempre a mano, sin importar cuánto se haya
            bajado en la ficha. */}
        {!cargando && !error && (
          <div className="border-t border-neutro-100 p-3 sm:p-4">
            <button
              type="button"
              onClick={onCerrar}
              className="w-full h-11 rounded-xl bg-neutro-900 hover:bg-neutro-800 text-white font-bold transition-colors"
            >
              Aceptar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
