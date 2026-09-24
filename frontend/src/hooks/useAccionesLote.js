import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'

const SONDEO_MS = 2000

const plural = (n, uno, varios) => (n === 1 ? uno : varios)

/**
 * Las acciones que mueven productos de lugar.
 *
 * MOVER A SUBCATEGORÍA es local e instantánea (un solo UPDATE). CAMBIAR DE
 * CATEGORÍA —unos productos sueltos, o una subcategoría completa— escribe en
 * Alegra (~3 s por producto): arranca un trabajo en el servidor y se sondea
 * su avance, para que la pantalla no se congele. Por eso son acciones
 * distintas y no un solo botón: quien lo usa tiene que saber cuándo espera.
 *
 * Un solo trabajo a la vez: el panel de avance es uno, y dos movimientos
 * cruzados sobre las mismas categorías serían difíciles de seguir.
 */
export function useAccionesLote({ arbol, patchProducto, recargarArbol, recargarLista, mostrarToast }) {
  const [moviendo, setMoviendo] = useState(false)
  const [trabajo, setTrabajo] = useState(null)
  const intervaloRef = useRef(null)

  const detenerSondeo = () => {
    if (intervaloRef.current) { clearInterval(intervaloRef.current); intervaloRef.current = null }
  }
  useEffect(() => detenerSondeo, [])

  const ocupado = Boolean(trabajo && !trabajo.terminado)

  const moverASubcategoria = useCallback(async (ids, subcategoriaId) => {
    if (ids.length === 0) return false
    setMoviendo(true)
    try {
      await api.put('/alegra/catalog/productos/subcategoria-lote', { alegraIds: ids, subcategoriaId })
      const sub = subcategoriaId
        ? arbol.flatMap((c) => c.subcategorias).find((s) => s.id === Number(subcategoriaId))
        : null
      const puesta = sub ? { id: sub.id, nombre: sub.nombre } : null
      ids.forEach((id) => patchProducto(id, { subcategoria: puesta }))
      mostrarToast('success', `${ids.length} ${plural(ids.length, 'producto movido', 'productos movidos')} a ${sub ? `"${sub.nombre}"` : 'Sin clasificar'}.`)
      recargarArbol()
      return true
    } catch (error) {
      console.error('Error moviendo el lote a subcategoría:', error)
      mostrarToast('error', error.response?.data?.message || 'No se pudo mover el lote.')
      return false
    } finally {
      setMoviendo(false)
    }
  }, [arbol, patchProducto, recargarArbol, mostrarToast])

  const seguir = useCallback((jobId, alTerminar) => {
    detenerSondeo()
    intervaloRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/alegra/catalog/trabajos/${jobId}`)
        if (!data?.success) throw new Error('sin datos')
        setTrabajo((prev) => ({ ...prev, total: data.total, hechos: data.hechos, errores: data.errores || [], terminado: data.terminado }))
        if (data.terminado) {
          detenerSondeo()
          recargarArbol()
          recargarLista()
          alTerminar(data)
        }
      } catch (error) {
        console.error('Error sondeando el trabajo de categoría:', error)
        detenerSondeo()
        setTrabajo((prev) => (prev ? { ...prev, terminado: true, perdido: true } : prev))
        mostrarToast('error', 'Se perdió el seguimiento del movimiento. Revisá el catálogo en un momento.')
      }
    }, SONDEO_MS)
  }, [recargarArbol, recargarLista, mostrarToast])

  const avisarOcupado = () =>
    mostrarToast('info', 'Hay un movimiento en curso. Esperá a que termine para empezar otro.')

  /** Productos sueltos a otra categoría. `categoria` es la del árbol ({id, name, nombreVisible}). */
  const cambiarCategoria = useCallback(async (ids, categoria) => {
    if (ids.length === 0 || !categoria) return false
    if (ocupado) { avisarOcupado(); return false }
    try {
      const { data } = await api.post('/alegra/catalog/productos/categoria-lote', { alegraIds: ids, categoriaId: categoria.id })
      if (!data?.success) throw new Error('no se pudo iniciar')
      setTrabajo({
        jobId: data.jobId, total: data.total, hechos: 0, errores: [], terminado: false,
        descripcion: `${ids.length} ${plural(ids.length, 'producto', 'productos')} a ${categoria.nombreVisible}`
      })
      seguir(data.jobId, (fin) => {
        const fallaron = fin.errores?.length || 0
        mostrarToast(
          fallaron ? 'error' : 'success',
          fallaron
            ? `${fin.hechos - fallaron} de ${fin.total} pasaron a ${categoria.nombreVisible}. ${fallaron} fallaron y quedaron donde estaban.`
            : `${fin.hechos} ${plural(fin.hechos, 'producto pasó', 'productos pasaron')} a ${categoria.nombreVisible}.`
        )
      })
      return true
    } catch (error) {
      console.error('Error iniciando el cambio de categoría en lote:', error)
      mostrarToast('error', error.response?.data?.message || 'No se pudo iniciar el cambio de categoría.')
      return false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocupado, seguir, mostrarToast])

  /** Una subcategoría completa, con todos sus productos, a otra categoría. */
  const moverSubcategoria = useCallback(async (sub, categoria) => {
    if (!sub || !categoria) return false
    if (ocupado) { avisarOcupado(); return false }
    try {
      const { data } = await api.post(`/alegra/catalog/subcategorias/${sub.id}/mover-categoria`, { categoriaId: categoria.id })
      if (!data?.success) throw new Error('no se pudo iniciar')
      setTrabajo({
        jobId: data.jobId, total: data.total, hechos: 0, errores: [], terminado: false,
        descripcion: `"${sub.nombre}" a ${categoria.nombreVisible}`
      })
      seguir(data.jobId, (fin) => {
        const fallaron = fin.errores?.length || 0
        if (fin.errorFinal) {
          mostrarToast('error', `Los productos cambiaron de categoría pero "${sub.nombre}" no se pudo reubicar: ${fin.errorFinal}`)
        } else if (fallaron) {
          mostrarToast('error', `${fin.hechos - fallaron} de ${fin.total} pasaron a ${categoria.nombreVisible}. ${fallaron} fallaron y siguen en "${sub.nombre}" donde estaba.`)
        } else {
          mostrarToast('success', fin.resultado?.juntada
            ? `"${sub.nombre}" se juntó con la que ya había en ${categoria.nombreVisible}.`
            : `"${sub.nombre}" ya está en ${categoria.nombreVisible}.`)
        }
      })
      return true
    } catch (error) {
      console.error('Error moviendo la subcategoría:', error)
      mostrarToast('error', error.response?.data?.message || 'No se pudo mover la subcategoría.')
      return false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocupado, seguir, mostrarToast])

  const cerrarTrabajo = useCallback(() => {
    detenerSondeo()
    setTrabajo(null)
  }, [])

  return { moviendo, trabajo, ocupado, moverASubcategoria, cambiarCategoria, moverSubcategoria, cerrarTrabajo }
}
