import { Sparkles, Plus } from 'lucide-react'
import { formatearColones } from '../../utils/catalogoClientesUtils'
import { notaHabitual, notaPerdido } from '../../utils/notasCatalogo'
import MiniaturaProducto from './MiniaturaProducto'

const TOPE = 8

/**
 * "Suele faltar", en su propio panel, al lado del pedido.
 *
 * Antes vivía DENTRO del panel del pedido, entre la lista de productos y el
 * total, y estorbaba justo cuando el cliente quería revisar lo que va a
 * comprar. Sacarlo afuera deja el pedido limpio de arriba abajo y conserva
 * la sugerencia a la vista.
 *
 * QUÉ SE SUGIERE Y POR QUÉ
 * Antes era "se lleva junto con" (co-ocurrencia con lo que ya está en el
 * carrito). Se cambió a lo que el cliente YA compra —sus productos de
 * siempre primero, y si faltan para llenar el panel, los que dejó de
 * comprar—: apostar a un hábito confirmado tiene más chance de que lo
 * agregue que adivinar por asociación con otros productos.
 *
 * `habituales` y `perdidos` no se piden acá: ya están en memoria porque la
 * portada los carga al entrar (useCatalogoClientes), así que este panel no
 * hace ninguna llamada — solo filtra lo que ya está en el carrito y arma la
 * lista.
 *
 * En escritorio va a la par. En móvil no cabe al lado, así que se convierte
 * en una franja horizontal ARRIBA de la hoja del pedido: se ve sin tocar
 * nada y no interrumpe la lectura del pedido, que queda entera abajo.
 */
export default function PanelSugerencias({ habituales, perdidos, onAgregar, carrito }) {
  const enCarrito = (id) => (carrito?.[id]?.cantidad || 0) > 0

  const productos = [...(habituales || []), ...(perdidos || [])]
    .filter(p => !enCarrito(p.id))
    .slice(0, TOPE)

  // Sin sugerencias no se dibuja nada: un panel vacío al lado del pedido es
  // peor que no tenerlo.
  if (productos.length === 0) return null

  const encabezado = (
    <div className="flex items-center gap-1.5">
      <Sparkles size={14} className="text-cliente-600" />
      <h2 className="text-[13px] font-bold text-neutro-900">Suele faltar</h2>
    </div>
  )

  const item = (p, compacto) => {
    const enPedido = carrito?.[p.id]?.cantidad || 0
    const nota = notaHabitual(p) || notaPerdido(p)
    return (
      <div
        key={p.id}
        className={compacto
          ? 'w-36 shrink-0 bg-white rounded-xl border border-neutro-200 p-2 flex flex-col gap-1.5'
          : 'flex items-center gap-2.5 bg-white rounded-xl border border-neutro-200 p-2'}
      >
        <MiniaturaProducto imagen={p.imagen} className={compacto ? 'w-full h-16' : undefined} />

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-neutro-900 leading-tight line-clamp-2">{p.nombre}</p>
          {nota && <p className="text-[10px] text-neutro-400 leading-tight">{nota}</p>}
          <p className="text-[12px] font-extrabold text-neutro-900 mt-0.5">{formatearColones(p.precio)}</p>
        </div>

        <button
          type="button"
          onClick={() => onAgregar(p, enPedido + 1)}
          aria-label={`Agregar ${p.nombre}`}
          className={`${compacto ? 'w-full h-7' : 'w-8 h-8 shrink-0'} rounded-lg bg-neutro-900 hover:bg-cliente-600 text-white flex items-center justify-center gap-1 text-[11px] font-bold transition-colors`}
        >
          <Plus size={13} />
          {compacto && 'Agregar'}
        </button>
      </div>
    )
  }

  return (
    <>
      {/* Móvil: franja horizontal arriba del pedido */}
      <div className="sm:hidden bg-neutro-100/95 backdrop-blur rounded-t-3xl px-4 pt-3 pb-2.5 space-y-2">
        {encabezado}
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
          {productos.map(p => item(p, true))}
        </div>
      </div>

      {/* Escritorio: panel propio, a la par del pedido */}
      <div className="hidden sm:flex w-64 bg-neutro-100 rounded-3xl p-3.5 flex-col gap-2.5 max-h-[88vh]">
        {encabezado}
        <div className="overflow-y-auto space-y-2 -mr-1 pr-1">
          {productos.map(p => item(p, false))}
        </div>
      </div>
    </>
  )
}
