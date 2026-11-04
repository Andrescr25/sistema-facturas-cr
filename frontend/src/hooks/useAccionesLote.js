import { useCallback, useRef, useState } from 'react'
import api from '../services/api'

const plural = (n, uno, varios) => (n === 1 ? uno : varios)

/**
 * Acciones sobre la selección, confirmadas en una petición al maestro propio.
 *
 * Siguen siendo acciones DISTINTAS por lo que le pasa al producto: mover a
 * subcategoría lo deja en su categoría; cambiar de categoría lo manda a "Sin
 * clasificar" de la otra.
 *
 * Los ids son los PROPIOS del producto (`producto.id`).
 */
export function useAccionesLote({ arbol, patchProducto, quitarProductos, recargarArbol, recargarLista, mostrarToast, confirm }) {
  const [moviendo, setMoviendo] = useState(false)
  const enCurso = useRef(false)

  const conMovimiento = useCallback(async (trabajo, mensajeError) => {
    if (enCurso.current) return false
    enCurso.current = true
    setMoviendo(true)
    try {
      return await trabajo()
    } catch (error) {
      console.error(mensajeError, error)
      mostrarToast('error', error.response?.data?.message || mensajeError)
      return false
    } finally {
      enCurso.current = false
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

  const cambiarEstado = useCallback(async (ids, accion) => {
    if (!ids.length || enCurso.current || !['ocultar', 'desactivar'].includes(accion)) return false
    const ocultar = accion === 'ocultar'
    const aprobado = await confirm(
      ocultar
        ? `${ids.length} ${plural(ids.length, 'producto dejará', 'productos dejarán')} de verse en los catálogos de clientes y del agente. Podrás seguir facturando los que estén activos.`
        : `${ids.length} ${plural(ids.length, 'producto se retirará', 'productos se retirarán')} de la venta y de los catálogos. Sus facturas, compras e historial se conservan.`,
      { title: ocultar ? 'Ocultar del catálogo' : 'Desactivar productos', confirmLabel: ocultar ? 'Ocultar' : 'Desactivar', variant: ocultar ? 'default' : 'danger' }
    )
    if (!aprobado) return false
    return conMovimiento(async () => {
      const { data } = await api.patch('/maestro/lote/estado', { productoIds: ids, ...(ocultar ? { oculto: true } : { activo: false }) })
      const actualizados = data.data.actualizados
      mostrarToast('success', actualizados
        ? `${actualizados} ${plural(actualizados, 'producto', 'productos')} ${ocultar ? 'fuera del catálogo' : plural(actualizados, 'desactivado', 'desactivados')}.`
        : 'Los productos ya tenían ese estado.')
      // Releer conserva el filtro de ocultos/inactivos; no se quitan a ciegas.
      recargarLista()
      recargarArbol()
      return true
    }, 'No se pudo cambiar el estado del lote.')
  }, [confirm, conMovimiento, mostrarToast, recargarLista, recargarArbol])

  return {
    moviendo,
    moverASubcategoria,
    cambiarCategoria,
    moverSubcategoria,
    cambiarEstado
  }
}
