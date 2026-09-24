import { useCallback, useState } from 'react'
import api from '../services/api'

const plural = (n, uno, varios) => (n === 1 ? uno : varios)

/**
 * Las acciones que mueven productos de lugar, sobre el maestro propio.
 *
 * En `main` cambiar de categoría escribe en Alegra (~3 s por producto) y es
 * un trabajo de fondo que se sondea. Acá las tres acciones son un UPDATE en
 * la base propia y vuelven en el momento, así que no hay trabajo ni panel de
 * avance: `trabajo` queda siempre en null y BarraLote no lo muestra.
 *
 * Siguen siendo acciones DISTINTAS por lo que le pasa al producto: mover a
 * subcategoría lo deja en su categoría; cambiar de categoría lo manda a "Sin
 * clasificar" de la otra.
 *
 * Los ids son los PROPIOS del producto (`producto.id`).
 */
export function useAccionesLote({ arbol, patchProducto, quitarProductos, recargarArbol, recargarLista, mostrarToast }) {
  const [moviendo, setMoviendo] = useState(false)

  const conMovimiento = useCallback(async (trabajo, mensajeError) => {
    setMoviendo(true)
    try {
      return await trabajo()
    } catch (error) {
      console.error(mensajeError, error)
      mostrarToast('error', error.response?.data?.message || mensajeError)
      return false
    } finally {
      setMoviendo(false)
    }
  }, [mostrarToast])

  const moverASubcategoria = useCallback((ids, subcategoriaId) => {
    if (ids.length === 0) return Promise.resolve(false)
    return conMovimiento(async () => {
      await api.put('/maestro/lote/subcategoria', { productoIds: ids, subcategoriaId: subcategoriaId || null })
      const sub = subcategoriaId
        ? arbol.flatMap((c) => c.subcategorias).find((s) => s.id === Number(subcategoriaId))
        : null
      const puesta = sub ? { id: sub.id, nombre: sub.nombre } : null
      ids.forEach((id) => patchProducto(id, { subcategoria: puesta }))
      mostrarToast('success', `${ids.length} ${plural(ids.length, 'producto movido', 'productos movidos')} a ${sub ? `"${sub.nombre}"` : 'Sin clasificar'}.`)
      recargarArbol()
      return true
    }, 'No se pudo mover el lote.')
  }, [arbol, patchProducto, recargarArbol, mostrarToast, conMovimiento])

  /** Productos sueltos a otra categoría. `categoria` es la del árbol ({id, name, nombreVisible}). */
  const cambiarCategoria = useCallback((ids, categoria) => {
    if (ids.length === 0 || !categoria) return Promise.resolve(false)
    return conMovimiento(async () => {
      await api.put('/maestro/lote/categoria', { productoIds: ids, categoriaId: categoria.id })
      // Dejan de pertenecer a lo que se está mirando.
      quitarProductos(ids)
      mostrarToast('success', `${ids.length} ${plural(ids.length, 'producto pasó', 'productos pasaron')} a ${categoria.nombreVisible}, en "Sin clasificar".`)
      recargarArbol()
      return true
    }, 'No se pudo cambiar de categoría.')
  }, [quitarProductos, recargarArbol, mostrarToast, conMovimiento])

  /** Una subcategoría completa, con todos sus productos, a otra categoría. */
  const moverSubcategoria = useCallback((sub, categoria) => {
    if (!sub || !categoria) return Promise.resolve(false)
    return conMovimiento(async () => {
      const { data } = await api.post(`/maestro/subcategorias/${sub.id}/mover`, { categoriaId: categoria.id })
      const movidos = data?.data?.movidos ?? 0
      mostrarToast('success', `"${sub.nombre}" ya está en ${categoria.nombreVisible}, con ${movidos} ${plural(movidos, 'producto', 'productos')}.`)
      recargarArbol()
      recargarLista()
      return true
    }, 'No se pudo mover la subcategoría.')
  }, [recargarArbol, recargarLista, mostrarToast, conMovimiento])

  return {
    moviendo,
    trabajo: null,
    ocupado: moviendo,
    moverASubcategoria,
    cambiarCategoria,
    moverSubcategoria,
    cerrarTrabajo: () => {}
  }
}
