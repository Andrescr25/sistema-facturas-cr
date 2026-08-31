import { useEffect } from 'react'

/**
 * Lo mínimo que todo modal debe hacer: cerrarse con Escape y no dejar que la
 * página de atrás se desplace.
 *
 * POR QUÉ ES UN HOOK Y NO SOLO EL COMPONENTE Modal
 * Hay 22 modales escritos a lo largo de meses, cada uno con su marcado. El
 * componente `ui/Modal` es a dónde van los nuevos, pero reescribir los 22 a
 * mano —en un sistema que factura todos los días, con modales que solo se ven
 * teniendo los datos justos— es mucho riesgo para el beneficio.
 *
 * Este hook da lo importante con una línea por archivo: ninguno de los 22
 * cerraba con Escape, y en todos, mover la rueda dentro del modal desplazaba
 * la lista de atrás. El marcado se irá unificando de a poco, sin apuro.
 */
export function useModal(onCerrar) {
  useEffect(() => {
    const alTeclado = (e) => { if (e.key === 'Escape') onCerrar?.() }
    document.addEventListener('keydown', alTeclado)

    // Se guarda el valor previo en vez de asumir que era '': si un modal abre
    // otro, al cerrar el de arriba no debe soltar el bloqueo del de abajo.
    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', alTeclado)
      document.body.style.overflow = overflowPrevio
    }
  }, [onCerrar])
}
