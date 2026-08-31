import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'

/**
 * El control de cantidad: − [número] +
 *
 * POR QUÉ EXISTE COMO COMPONENTE APARTE
 * El mismo control estaba escrito dos veces, en la tarjeta del catálogo y en
 * la ficha del producto, y las dos copias tenían el mismo error. Arreglarlas
 * por separado es como este sistema terminó con la misma regla en cuatro
 * archivos. Acá vive una sola vez.
 *
 * EL ERROR QUE ARREGLA
 * El input estaba atado directo al carrito. Al borrar el "1", el onChange
 * mandaba '' al carrito, que lo redondeaba a 0, la línea se sacaba del
 * pedido y —porque quien lo llamaba dibuja el stepper solo cuando la
 * cantidad es mayor a 0— React DESMONTABA el input y ponía un botón
 * "Agregar" en su lugar. El cliente borraba el 1 para escribir 12 y el campo
 * le desaparecía debajo del dedo.
 *
 * La causa de fondo es que vacío y cero se trataban igual, y no son lo mismo:
 *
 *   vacío  el cliente está a mitad de escribir. No se toca el carrito.
 *   cero   el cliente lo quiere fuera del pedido. Sí se toca.
 *
 * Por eso hay un borrador local: mientras se escribe, el carrito conserva la
 * última cantidad válida y el input no se puede desmontar.
 */
export default function InputCantidad({ cantidad, onCambiar, etiqueta = '', compacto = false }) {
  // null = mostrar la cantidad del carrito. Un texto = lo que se está
  // escribiendo ahora, que puede ser '' mientras se borra.
  const [borrador, setBorrador] = useState(null)

  const valor = borrador ?? String(cantidad)

  const escribir = (texto) => {
    setBorrador(texto)
    // Vacío NO se manda al carrito: es un estado de tránsito. Sin esto, el
    // input se desmonta y no se puede terminar de escribir el número.
    if (texto === '') return
    const n = Math.max(0, Math.floor(Number(texto) || 0))
    onCambiar(n)
  }

  /**
   * Al salir del campo se suelta el borrador y vuelve a mandar la cantidad
   * del carrito. Si quedó vacío, eso restaura el valor anterior: dudar y
   * tocar en otro lado no debería borrarle el producto del pedido. Para
   * quitarlo están el "−" y escribir 0.
   */
  const soltar = () => setBorrador(null)

  const paso = (n) => {
    setBorrador(null)
    onCambiar(Math.max(0, n))
  }

  const claseCaja = compacto
    ? 'flex items-center gap-1 bg-white rounded-lg border border-cliente-300 p-0.5'
    : 'flex items-center gap-2'

  const claseBoton = compacto
    ? 'w-8 h-8 rounded-md flex items-center justify-center'
    : 'w-11 h-11 rounded-xl flex items-center justify-center'

  const claseInput = compacto
    ? 'flex-1 w-full text-center text-[13px] font-extrabold text-neutro-900 focus:outline-none bg-transparent'
    : 'w-20 h-11 text-center border-2 border-cliente-500 rounded-xl font-extrabold focus:outline-none'

  return (
    <div className={claseCaja}>
      <button
        type="button"
        aria-label={`Quitar uno${etiqueta ? ` de ${etiqueta}` : ''}`}
        onClick={() => paso(cantidad - 1)}
        className={`${claseBoton} ${compacto ? 'hover:bg-neutro-100 text-neutro-600' : 'bg-neutro-100 hover:bg-neutro-200'}`}
      >
        <Minus size={compacto ? 14 : 16} />
      </button>

      <input
        type="number"
        min="0"
        inputMode="numeric"
        aria-label={`Cantidad${etiqueta ? ` de ${etiqueta}` : ''}`}
        value={valor}
        onChange={(e) => escribir(e.target.value)}
        onBlur={soltar}
        // Al tocar el campo se selecciona el número entero: escribir otra
        // cantidad es UN toque y teclear, sin tener que borrar primero.
        onFocus={(e) => e.target.select()}
        className={claseInput}
      />

      <button
        type="button"
        aria-label={`Agregar uno${etiqueta ? ` de ${etiqueta}` : ''}`}
        onClick={() => paso(cantidad + 1)}
        className={`${claseBoton} bg-cliente-600 hover:bg-cliente-700 text-white`}
      >
        <Plus size={compacto ? 14 : 16} />
      </button>
    </div>
  )
}
