import { useEffect, useState } from 'react'
import { X, Loader2, ImageOff, Minus, Plus, History } from 'lucide-react'
import apiPortal from '../../services/apiPortal'
import { formatearColones } from '../../utils/catalogoClientesUtils'
import { haceCuanto } from '../../utils/notasCatalogo'
import SugerenciasJuntoCon from './SugerenciasJuntoCon'

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
          className="absolute right-3 top-3 z-10 p-1.5 bg-white/90 rounded-full text-gray-500 hover:text-gray-900"
        >
          <X size={18} />
        </button>

        {cargando ? (
          <div className="py-24 flex justify-center"><Loader2 size={26} className="animate-spin text-emerald-600" /></div>
        ) : error ? (
          <p className="py-24 text-center text-sm text-gray-400 px-6">{error}</p>
        ) : (
          <div className="overflow-y-auto">
            <div className="sm:flex sm:gap-5 p-4 sm:p-5">
              <div className="sm:w-56 shrink-0 aspect-square bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden relative">
                {producto.imagen ? (
                  <img src={producto.imagen} alt={producto.nombre} className="w-full h-full object-contain" />
                ) : (
                  <ImageOff size={32} className="text-gray-200" />
                )}
                {producto.descuento > 0 && (
                  <span className="absolute top-2 left-2 bg-red-600 text-white text-[11px] font-extrabold px-2 py-0.5 rounded-md">
                    −{producto.descuento}%
                  </span>
                )}
              </div>

              <div className="mt-4 sm:mt-0 flex-1 min-w-0 space-y-3">
                <div>
                  <h2 className="font-extrabold text-gray-900 leading-snug">{producto.nombre}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {producto.referencia ? `Ref. ${producto.referencia} · ` : ''}{producto.categoria}
                  </p>
                </div>

                <div>
                  {producto.precioLista && (
                    <p className="text-sm text-gray-400 line-through leading-none">
                      {formatearColones(producto.precioLista)}
                    </p>
                  )}
                  <p className={`text-2xl font-extrabold ${producto.descuento ? 'text-red-600' : 'text-emerald-700'}`}>
                    {formatearColones(producto.precio)}
                  </p>
                </div>

                {h && (
                  <div className="bg-emerald-50/60 border border-emerald-150 rounded-2xl p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <History size={13} className="text-emerald-700" />
                      <p className="text-[11px] font-extrabold text-emerald-800 uppercase tracking-wide">
                        Su historial con este producto
                      </p>
                    </div>
                    <p className="text-xs text-emerald-900">
                      Lo ha llevado <strong>{h.veces} {h.veces === 1 ? 'vez' : 'veces'}</strong>
                      {h.unidades > 0 && <> · <strong>{Math.round(h.unidades)}</strong> unidades en total</>}
                    </p>
                    <p className="text-xs text-emerald-700">
                      La última vez, {haceCuanto(h.dias)}
                    </p>
                  </div>
                )}

                {cantidadEnCarrito > 0 ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Quitar uno"
                      onClick={() => onCambiar(producto, cantidadEnCarrito - 1)}
                      className="w-11 h-11 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                    >
                      <Minus size={16} />
                    </button>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      aria-label="Cantidad"
                      value={cantidadEnCarrito}
                      onChange={(e) => onCambiar(producto, e.target.value)}
                      className="w-20 h-11 text-center border-2 border-emerald-500 rounded-xl font-extrabold focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Agregar uno"
                      onClick={() => onCambiar(producto, cantidadEnCarrito + 1)}
                      className="w-11 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center"
                    >
                      <Plus size={16} />
                    </button>
                    <span className="text-xs text-gray-400 font-semibold">en su pedido</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onCambiar(producto, 1)}
                    className="w-full sm:w-auto px-6 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors"
                  >
                    Agregar al pedido
                  </button>
                )}
              </div>
            </div>

            {producto.juntoCon?.length > 0 && (
              <div className="border-t border-gray-100 p-4 sm:p-5">
                <SugerenciasJuntoCon
                  ids={[producto.id]}
                  titulo="Quienes lo llevan, también llevan"
                  onAgregar={onCambiar}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
