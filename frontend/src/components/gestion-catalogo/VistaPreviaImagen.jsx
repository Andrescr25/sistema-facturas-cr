import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImageIcon } from 'lucide-react'

const ANCHO = 304
const ALTO = 336
const SEPARACION = 14

/**
 * La miniatura de un producto y, al pasarle el mouse, un cuadro aparte con
 * la foto en grande — para juzgar si es la correcta sin abrir nada.
 *
 * NO ES UN ZOOM DE LA MINIATURA. Agrandar la misma imagen de 64 px en su
 * lugar la pixelaba y la cortaba contra el borde de la tarjeta. Acá el
 * cuadro es otra imagen, a su tamaño, dibujada en un portal sobre la página:
 * las secciones tienen `overflow-hidden` y cualquier cosa dibujada adentro
 * quedaría recortada.
 *
 * Sale a la derecha de la miniatura; si no cabe, a la izquierda. En una
 * pantalla táctil el toque hace de "pasar el mouse", y tocar en otro lado lo
 * cierra.
 */
export default function VistaPreviaImagen({ src, nombre, tamano = 'h-16 w-16' }) {
  const ref = useRef(null)
  const [posicion, setPosicion] = useState(null)

  const abrir = () => {
    if (!src || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    let left = r.right + SEPARACION
    if (left + ANCHO > window.innerWidth - 8) left = Math.max(8, r.left - SEPARACION - ANCHO)
    const top = Math.max(8, Math.min(r.top + r.height / 2 - ALTO / 2, window.innerHeight - ALTO - 8))
    setPosicion({ left, top })
  }
  const cerrar = () => setPosicion(null)

  // Si la página se desplaza con el cuadro abierto, queda apuntando a otra
  // fila: se cierra.
  useEffect(() => {
    if (!posicion) return
    window.addEventListener('scroll', cerrar, true)
    return () => window.removeEventListener('scroll', cerrar, true)
  }, [posicion])

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={abrir}
        onMouseLeave={cerrar}
        className={`${tamano} flex shrink-0 items-center justify-center overflow-hidden rounded-xl border ${
          src ? 'cursor-zoom-in border-neutro-200 bg-white' : 'border-dashed border-peligro-200 bg-peligro-50'
        }`}
      >
        {src ? (
          <img src={src} alt={nombre} loading="lazy" className="h-full w-full object-contain p-1" />
        ) : (
          <div className="flex flex-col items-center gap-0.5 text-peligro-400">
            <ImageIcon size={20} />
            <span className="text-[10px] font-bold uppercase">Sin foto</span>
          </div>
        )}
      </div>

      {posicion && createPortal(
        <div
          className="pointer-events-none fixed z-[70] rounded-2xl border border-neutro-200 bg-white p-3 shadow-2xl"
          style={{ left: posicion.left, top: posicion.top, width: ANCHO }}
        >
          <div className="flex h-72 items-center justify-center overflow-hidden rounded-xl bg-neutro-50">
            <img src={src} alt={nombre} className="max-h-full max-w-full object-contain" />
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-semibold text-neutro-800">{nombre}</p>
        </div>,
        document.body
      )}
    </>
  )
}
