import { useEffect } from 'react'
import { Loader2, ImageOff, History } from 'lucide-react'
import { useFichaProductoCliente } from '../../hooks/useFichaProductoCliente'
import Modal from '../ui/Modal'
import { formatearColones } from '../../utils/catalogoClientesUtils'
import { haceCuanto } from '../../utils/notasCatalogo'
import SugerenciasJuntoCon from './SugerenciasJuntoCon'
import InputCantidad from './InputCantidad'
import { urlArchivo } from '../../utils/urlArchivo'

/**
 * Ficha de un producto.
 *
 * Lo que la hace distinta de un catálogo cualquiera es el bloque de
 * historial: en vez de "otros clientes lo recomiendan", dice cuántas veces
 * lo ha llevado ESTE cliente y desde cuándo. Eso es lo que reemplaza a la
 * publicidad — no hace falta convencerlo de nada, solo recordarle.
 *
 * También permite apreciar la imagen como visitante, sin consultar historial
 * ni dibujar controles de compra hasta que haya una cuenta.
 */
export default function FichaProducto({ itemId, inicial, cantidadEnCarrito, onCambiar, onCerrar }) {
  const puedePedir = typeof onCambiar === 'function'
  const { producto, cargando, error } = useFichaProductoCliente(itemId, inicial, puedePedir)
  useEffect(() => {
    const anterior = document.activeElement
    return () => anterior?.focus()
  }, [])

  const h = puedePedir ? producto?.historial : null

  return (
    <Modal onCerrar={onCerrar} ancho="xl" titulo={producto?.marca?.nombre || producto?.nombre || 'Producto'}
      pie={<button type="button" onClick={onCerrar} className="h-11 w-full rounded-xl bg-neutro-900 font-bold text-white hover:bg-neutro-800">Aceptar</button>}>
      {cargando ? (
        <div className="py-24 flex justify-center"><Loader2 size={26} className="animate-spin text-cliente-600" /></div>
      ) : error ? (
        <p className="py-24 text-center text-sm text-neutro-400 px-6">{error}</p>
      ) : producto ? (
        <div>
          <div className="sm:flex sm:gap-5 p-4 sm:p-5">
            <div className="sm:w-56 shrink-0 aspect-square bg-neutro-50 rounded-2xl flex items-center justify-center overflow-hidden relative">
              {producto.imagen ? (
                <img src={urlArchivo(producto.imagen)} alt={producto.nombre} className="w-full h-full object-contain" />
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
                  {producto.referencia ? `Ref. ${producto.referencia} · ` : ''}{producto.categoriaVisible || producto.categoria}{producto.subcategoria?.nombre ? ` · ${producto.subcategoria.nombre}` : ''}
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

              {puedePedir && (cantidadEnCarrito > 0 ? (
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
              ))}
            </div>
          </div>

          {puedePedir && producto.juntoCon?.length > 0 && (
            <div className="border-t border-neutro-100 p-4 sm:p-5">
              <SugerenciasJuntoCon
                ids={[producto.id]}
                titulo="Quienes lo llevan, también llevan"
                onAgregar={onCambiar}
              />
            </div>
          )}
        </div>
      ) : null}

    </Modal>
  )
}
