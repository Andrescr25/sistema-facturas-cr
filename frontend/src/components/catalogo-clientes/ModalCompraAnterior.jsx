import { useEffect, useState, useMemo } from 'react'
import { X, Loader2, Minus, Plus, Trash2, Package, AlertCircle, ShoppingCart } from 'lucide-react'
import apiPortal from '../../services/apiPortal'
import { formatearColones } from '../../utils/catalogoClientesUtils'
import { useModal } from '../../hooks/useModal'

/**
 * Una compra anterior, abierta para revisarla antes de repetirla.
 *
 * Antes "Pedir lo mismo" mandaba las ~20 líneas al carrito de un golpe y el
 * cliente tenía que ir a sacar lo que no quería. Acá ajusta cantidades y
 * quita lo que no va ANTES de agregar, que es como se arma un pedido de
 * verdad: casi nunca se repite una compra idéntica.
 *
 * Los precios son los de HOY, no los de aquella factura: es lo que va a
 * pagar. El de entonces solo confundiría al comparar con el total.
 */
export default function ModalCompraAnterior({ facturaId, onCerrar, onAgregado }) {
  useModal(onCerrar)
  const [compra, setCompra] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [cantidades, setCantidades] = useState({})
  const [agregando, setAgregando] = useState(false)

  useEffect(() => {
    let vigente = true
    apiPortal.get(`/portal/compras/${facturaId}`)
      .then(({ data }) => {
        if (!vigente) return
        setCompra(data.data)
        // Arranca con lo que llevó aquella vez; lo que ya no se consigue
        // queda fuera desde el principio.
        setCantidades(Object.fromEntries(
          data.data.items.filter(i => i.disponible).map(i => [i.id, i.cantidad])
        ))
      })
      .catch((err) => { if (vigente) setError(err.response?.data?.message || 'No se pudo abrir la compra.') })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [facturaId])

  const cambiar = (id, valor) => {
    const n = Math.max(0, Math.floor(Number(valor) || 0))
    setCantidades(prev => {
      if (n === 0) { const { [id]: _, ...resto } = prev; return resto }
      return { ...prev, [id]: n }
    })
  }

  const elegidos = useMemo(() => {
    if (!compra) return []
    return compra.items.filter(i => i.disponible && cantidades[i.id] > 0)
  }, [compra, cantidades])

  const total = elegidos.reduce((s, i) => s + cantidades[i.id] * i.precio, 0)
  const noDisponibles = compra?.items.filter(i => !i.disponible) || []

  const agregar = async () => {
    setAgregando(true)
    setError('')
    try {
      const { data } = await apiPortal.post('/portal/carrito/varios', {
        lineas: elegidos.map(i => ({ productoId: i.id, cantidad: cantidades[i.id] }))
      })
      onAgregado?.(data.data)
      onCerrar()
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo agregar al pedido.')
    } finally {
      setAgregando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />

      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutro-200">
          <div className="min-w-0">
            <h2 className="font-bold text-neutro-900 text-[14px] leading-tight">Repetir esta compra</h2>
            {compra && (
              <p className="text-[11px] text-neutro-400">
                {new Date(compra.fecha).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}Quite o ajuste lo que no vaya
              </p>
            )}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 text-neutro-400 hover:text-neutro-800 shrink-0">
            <X size={19} />
          </button>
        </div>

        {cargando ? (
          <div className="py-20 flex justify-center"><Loader2 size={24} className="animate-spin text-cliente-600" /></div>
        ) : error && !compra ? (
          <p className="py-20 text-center text-[13px] text-neutro-400 px-6">{error}</p>
        ) : (
          <>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
              {compra.items.filter(i => i.disponible).map(i => {
                const n = cantidades[i.id] || 0
                const fuera = n === 0
                return (
                  <div
                    key={i.id}
                    className={`flex items-center gap-2.5 rounded-xl border p-2 transition-colors ${
                      fuera ? 'border-neutro-200 bg-neutro-50 opacity-60' : 'border-neutro-200 bg-white'
                    }`}
                  >
                    <div className="w-11 h-11 shrink-0 bg-neutro-50 rounded-lg overflow-hidden flex items-center justify-center">
                      {i.imagen
                        ? <img src={i.imagen} alt="" loading="lazy" className="w-full h-full object-contain"
                               onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                        : <Package size={15} className="text-neutro-300" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-neutro-900 leading-tight line-clamp-2">{i.nombre}</p>
                      <p className="text-[11px] text-neutro-400">
                        {formatearColones(i.precio)}
                        {n > 0 && <> · <strong className="text-neutro-600">{formatearColones(n * i.precio)}</strong></>}
                      </p>
                    </div>

                    {fuera ? (
                      <button
                        type="button"
                        onClick={() => cambiar(i.id, i.cantidad)}
                        className="shrink-0 h-8 px-3 rounded-lg border border-neutro-200 hover:border-cliente-500 text-[11px] font-bold text-neutro-500 hover:text-cliente-700"
                      >
                        Volver a poner
                      </button>
                    ) : (
                      <div className="shrink-0 flex items-center gap-1">
                        <div className="flex items-center gap-0.5 rounded-lg border border-neutro-200 p-0.5">
                          <button
                            type="button"
                            aria-label={`Quitar uno de ${i.nombre}`}
                            onClick={() => cambiar(i.id, n - 1)}
                            className="w-7 h-7 rounded-md hover:bg-neutro-100 flex items-center justify-center text-neutro-600"
                          >
                            <Minus size={13} />
                          </button>
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            aria-label={`Cantidad de ${i.nombre}`}
                            value={n}
                            onChange={(e) => cambiar(i.id, e.target.value)}
                            className="w-8 text-center text-[12px] font-extrabold text-neutro-900 bg-transparent focus:outline-none"
                          />
                          <button
                            type="button"
                            aria-label={`Agregar uno de ${i.nombre}`}
                            onClick={() => cambiar(i.id, n + 1)}
                            className="w-7 h-7 rounded-md bg-cliente-600 hover:bg-cliente-700 text-white flex items-center justify-center"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        <button
                          type="button"
                          aria-label={`Sacar ${i.nombre}`}
                          onClick={() => cambiar(i.id, 0)}
                          className="w-7 h-7 rounded-md text-neutro-300 hover:text-peligro-600 hover:bg-peligro-50 flex items-center justify-center"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {noDisponibles.length > 0 && (
                <div className="flex items-start gap-2 bg-alerta-50 border border-alerta-200 rounded-xl px-3 py-2.5 mt-2">
                  <AlertCircle size={14} className="text-alerta-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-alerta-800">
                    {noDisponibles.length} producto{noDisponibles.length === 1 ? '' : 's'} de esa compra
                    {noDisponibles.length === 1 ? ' ya no se consigue' : ' ya no se consiguen'}.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-neutro-200 p-4 space-y-2.5">
              {error && (
                <div className="flex items-start gap-2 bg-peligro-50 border border-peligro-200 rounded-xl px-3 py-2">
                  <AlertCircle size={14} className="text-peligro-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-peligro-700 font-semibold">{error}</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-neutro-400">
                  {elegidos.length} de {compra.items.filter(i => i.disponible).length}
                </span>
                <span className="text-[17px] font-extrabold text-neutro-900">{formatearColones(total)}</span>
              </div>

              <button
                type="button"
                onClick={agregar}
                disabled={agregando || elegidos.length === 0}
                className="w-full bg-neutro-900 hover:bg-cliente-600 disabled:bg-neutro-200 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {agregando ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
                {elegidos.length === 0
                  ? 'Elija al menos un producto'
                  : `Agregar ${elegidos.length} al pedido`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
