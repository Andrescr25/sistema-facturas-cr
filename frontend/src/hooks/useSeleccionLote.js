import { useCallback, useRef, useState } from 'react'

/**
 * Selección múltiple de productos, para las acciones en lote de Gestión de
 * Catálogo. Shift-clic selecciona el rango contra el orden en que las filas
 * están dibujadas AHORA MISMO (`ordenPlano`, que pasa quien llama) — no hay
 * un orden propio acá, es el mismo que ve la persona en pantalla.
 */
export function useSeleccionLote() {
  const [seleccionados, setSeleccionados] = useState(new Set())
  const ultimoRef = useRef(null)

  const alternar = useCallback((alegraId, { rango = false, ordenPlano = [] } = {}) => {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (rango && ultimoRef.current) {
        const iA = ordenPlano.indexOf(ultimoRef.current)
        const iB = ordenPlano.indexOf(alegraId)
        if (iA !== -1 && iB !== -1) {
          const [desde, hasta] = iA < iB ? [iA, iB] : [iB, iA]
          for (let i = desde; i <= hasta; i++) next.add(ordenPlano[i])
          ultimoRef.current = alegraId
          return next
        }
      }
      if (next.has(alegraId)) next.delete(alegraId)
      else next.add(alegraId)
      ultimoRef.current = alegraId
      return next
    })
  }, [])

  const seleccionarTodos = useCallback((ids) => {
    setSeleccionados((prev) => new Set([...prev, ...ids]))
  }, [])

  const deseleccionarTodos = useCallback((ids) => {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }, [])

  const limpiar = useCallback(() => {
    setSeleccionados(new Set())
    ultimoRef.current = null
  }, [])

  const estaSeleccionado = useCallback((id) => seleccionados.has(id), [seleccionados])

  return {
    seleccionados,
    cantidad: seleccionados.size,
    alternar,
    seleccionarTodos,
    deseleccionarTodos,
    limpiar,
    estaSeleccionado
  }
}
