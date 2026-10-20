import { useCallback, useRef } from 'react'

/**
 * Cerrar un formulario con cambios sin guardar pregunta antes.
 *
 * POR QUÉ (2026-10-19). El usuario puso un descuento global en la ficha de
 * un cliente y al facturarle no se aplicaba: en producción la ficha seguía
 * en 0 % y el servidor no había recibido ni un intento de guardarla. Escribir
 * el dato y cerrar la hoja con la X, «Cancelar» o Escape lo descartaba sin
 * decir nada; el «1 cambios sin guardar» del pie no lo impedía.
 *
 * `cerrar()` sale directo si no hay cambios; si hay, pregunta con el diálogo
 * de la página (`confirm` de useDialog). Mientras la pregunta está abierta,
 * otro Escape no la repite.
 *
 * @param {object} p
 * @param {number} p.cambios  cuántos campos cambiaron
 * @param {Function} p.confirm  el `confirm` de useDialog
 * @param {Function} p.onCerrar  cerrar de verdad
 */
export function useSalirSinGuardar({ cambios, confirm, onCerrar }) {
  const preguntando = useRef(false)
  return useCallback(async () => {
    if (preguntando.current) return
    if (!cambios || !confirm) { onCerrar(); return }
    preguntando.current = true
    try {
      const salir = await confirm(`Hay ${cambios} ${cambios === 1 ? 'cambio' : 'cambios'} sin guardar. Si salís ahora, se pierden.`,
        { title: '¿Salir sin guardar?', confirmLabel: 'Salir sin guardar', cancelLabel: 'Seguir editando', variant: 'danger' })
      if (salir) onCerrar()
    } finally {
      preguntando.current = false
    }
  }, [cambios, confirm, onCerrar])
}
