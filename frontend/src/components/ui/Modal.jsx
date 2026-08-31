import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/**
 * El modal del sistema.
 *
 * POR QUÉ EXISTE
 * Había 22 modales, cada uno con su propio fondo oscuro: siete variantes del
 * mismo efecto (`bg-black bg-opacity-50`, `bg-black/60`, `bg-gray-500
 * bg-opacity-75`...), con esquinas de 8, 16 o 24 píxeles según el archivo.
 * Nada de eso era una decisión; era el archivo que se tuvo al lado al copiar.
 *
 * Y NINGUNO cerraba con Escape. Los 22. Eso no se arregla 22 veces: se
 * arregla acá.
 *
 * QUÉ RESUELVE POR TODOS
 *   · Escape cierra.
 *   · Clic en el fondo cierra.
 *   · Mientras está abierto, la página de atrás no se desplaza — si no, uno
 *     mueve la rueda dentro del modal y lo que se corre es la lista de
 *     abajo.
 *   · En teléfono entra como hoja desde abajo, que es donde llega el pulgar.
 *
 * `hoja={false}` lo deja centrado también en móvil: sirve para confirmaciones
 * cortas, donde una hoja de altura completa es desproporcionada.
 */

const ANCHOS = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
  '2xl': 'sm:max-w-4xl',
}

export default function Modal({
  onCerrar,
  titulo,
  ancho = 'md',
  hoja = true,
  children,
  pie,
  className = '',
}) {
  const panel = useRef(null)

  useEffect(() => {
    const alTeclado = (e) => { if (e.key === 'Escape') onCerrar?.() }
    document.addEventListener('keydown', alTeclado)

    // Se guarda el valor previo en vez de asumir que era '': si un modal
    // abre otro, al cerrar el de arriba no debe soltar el bloqueo del de
    // abajo y dejar que la página se mueva por detrás.
    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', alTeclado)
      document.body.style.overflow = overflowPrevio
    }
  }, [onCerrar])

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center ${hoja ? 'items-end sm:items-center sm:p-4' : 'items-center p-4'}`}
      role="dialog"
      aria-modal="true"
      aria-label={typeof titulo === 'string' ? titulo : undefined}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCerrar} />

      <div
        ref={panel}
        className={`relative flex w-full flex-col overflow-hidden bg-white shadow-2xl ${ANCHOS[ancho] || ANCHOS.md} ${
          hoja ? 'max-h-[92vh] rounded-t-3xl sm:rounded-3xl' : 'max-h-[90vh] rounded-3xl'
        } ${className}`}
      >
        {titulo && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutro-100 px-5 py-4">
            {typeof titulo === 'string'
              ? <h2 className="font-extrabold text-neutro-900">{titulo}</h2>
              : titulo}
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="shrink-0 rounded-lg p-1 text-neutro-400 transition-colors hover:bg-neutro-100 hover:text-neutro-900"
            >
              <X size={20} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">{children}</div>

        {pie && <div className="shrink-0 border-t border-neutro-100 p-4">{pie}</div>}
      </div>
    </div>
  )
}
