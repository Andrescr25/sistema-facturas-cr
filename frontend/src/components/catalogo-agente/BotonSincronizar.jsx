import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const MS_PARA_ACCIONAR = 3000

/**
 * Actualizar el catálogo: hay que mantenerlo apretado tres segundos.
 *
 * POR QUÉ NO ES UN BOTÓN NORMAL
 * La sincronización baja el catálogo entero con sus fotos: tarda, ocupa la
 * pantalla completa y no se puede cancelar a la mitad sin dejar la tablet con
 * datos incompletos. En una tablet que se usa de pie, con el cliente
 * enfrente, un roce del pulgar arrancaba todo eso sin querer.
 *
 * Tres segundos es más de lo que dura un accidente y menos de lo que cansa.
 * El anillo que se va llenando es lo que convierte la espera en una
 * instrucción: sin él, el primer segundo se siente como un botón roto.
 *
 * Soltar antes cancela y no pasa nada — a propósito no hay confirmación
 * después: la confirmación ES el apretar sostenido.
 */
export default function BotonSincronizar({ sincronizando, ultimaSync, onSincronizar }) {
  const [progreso, setProgreso] = useState(0)
  const cuadro = useRef(null)
  const inicio = useRef(0)

  const detener = useCallback(() => {
    if (cuadro.current) cancelAnimationFrame(cuadro.current)
    cuadro.current = null
    setProgreso(0)
  }, [])

  // Si el componente se va a mitad de la pulsación, el bucle seguiría vivo.
  useEffect(() => detener, [detener])

  const empezar = useCallback(() => {
    if (sincronizando || cuadro.current) return
    inicio.current = performance.now()

    const paso = (ahora) => {
      const avance = Math.min(1, (ahora - inicio.current) / MS_PARA_ACCIONAR)
      setProgreso(avance)
      if (avance >= 1) {
        detener()
        onSincronizar()
        return
      }
      cuadro.current = requestAnimationFrame(paso)
    }
    cuadro.current = requestAnimationFrame(paso)
  }, [sincronizando, onSincronizar, detener])

  const titulo = ultimaSync
    ? `Mantené apretado 3 segundos para actualizar. Última: ${new Date(ultimaSync).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    : 'Mantené apretado 3 segundos para actualizar el catálogo'

  const apretando = progreso > 0

  return (
    <button
      type="button"
      disabled={sincronizando}
      title={titulo}
      aria-label="Actualizar catálogo (mantener apretado 3 segundos)"
      onPointerDown={empezar}
      onPointerUp={detener}
      onPointerLeave={detener}
      onPointerCancel={detener}
      // El menú contextual del táctil aparece al mantener apretado y corta el
      // gesto justo antes de completarse.
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex h-10 w-10 shrink-0 touch-none select-none items-center justify-center overflow-hidden rounded-xl ring-1 transition-colors disabled:opacity-50 ${
        apretando ? 'bg-acento-50 text-acento-600 ring-acento-300' : 'text-neutro-500 ring-neutro-200 hover:bg-neutro-100'
      }`}
    >
      {/* El relleno sube desde abajo: se ve incluso con el dedo encima, que
          es lo que tapa cualquier indicador puesto en el centro. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-acento-500/20 transition-none"
        style={{ height: `${progreso * 100}%` }}
      />
      <RefreshCw
        size={16}
        className={`relative ${sincronizando ? 'animate-spin' : ''}`}
        style={apretando ? { transform: `rotate(${progreso * 360}deg)` } : undefined}
      />
    </button>
  )
}
