import { useCallback, useRef, useState } from 'react'
import api from '../services/api'

const SONDEO_MS = 2000

/**
 * Las dos acciones en lote de la barra pegajosa. A PROPÓSITO SON DOS
 * FUNCIONES DISTINTAS, no una: mover a subcategoría es local e instantánea
 * (un solo UPDATE); cambiar de categoría escribe en Alegra (~3 s por
 * producto) y no puede responder al toque, así que arranca un trabajo en
 * segundo plano y lo sondea. Si compartieran un solo botón, quien lo usa no
 * entendería por qué a veces tarda 3 minutos y a veces nada.
 */
export function useAccionesLote({ arbol, patchProducto, quitarProductos, recargarArbol, mostrarToast }) {
  const [moviendo, setMoviendo] = useState(false)
  const [trabajoCategoria, setTrabajoCategoria] = useState(null)
  const intervaloRef = useRef(null)

  const detenerSondeo = () => {
    if (intervaloRef.current) { clearInterval(intervaloRef.current); intervaloRef.current = null }
  }

  const moverASubcategoria = useCallback(async (ids, subcategoriaId) => {
    if (ids.length === 0) return
    setMoviendo(true)
    try {
      await api.put('/alegra/catalog/productos/subcategoria-lote', { alegraIds: ids, subcategoriaId })
      const sub = subcategoriaId
        ? arbol.flatMap((c) => c.subcategorias).find((s) => s.id === Number(subcategoriaId))
        : null
      const puesta = sub ? { id: sub.id, nombre: sub.nombre } : null
      ids.forEach((id) => patchProducto(id, { subcategoria: puesta }))
      mostrarToast('success', `${ids.length} producto${ids.length === 1 ? '' : 's'} movido${ids.length === 1 ? '' : 's'}.`)
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

  const sondear = useCallback((jobId, idsOriginales) => {
    detenerSondeo()
    intervaloRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/alegra/catalog/trabajos/${jobId}`)
        if (!data?.success) throw new Error('sin datos')
        setTrabajoCategoria({ jobId, total: data.total, hechos: data.hechos, errores: data.errores || [], terminado: data.terminado })

        if (data.terminado) {
          detenerSondeo()
          const idsConError = new Set((data.errores || []).map((e) => e.alegraId))
          quitarProductos(idsOriginales.filter((id) => !idsConError.has(id)))
          recargarArbol()
          mostrarToast(
            idsConError.size > 0 ? 'error' : 'success',
            idsConError.size > 0
              ? `${data.hechos - idsConError.size} de ${data.total} movidos. ${idsConError.size} fallaron (quedan donde estaban).`
              : `${data.hechos} producto${data.hechos === 1 ? '' : 's'} movido${data.hechos === 1 ? '' : 's'} de categoría.`
          )
        }
      } catch (error) {
        console.error('Error sondeando el trabajo de categoría:', error)
        detenerSondeo()
        mostrarToast('error', 'Se perdió el seguimiento del cambio de categoría. Revisá el catálogo en un momento.')
      }
    }, SONDEO_MS)
  }, [quitarProductos, recargarArbol, mostrarToast])

  const cambiarCategoria = useCallback(async (ids, categoriaId) => {
    if (ids.length === 0) return
    try {
      const { data } = await api.post('/alegra/catalog/productos/categoria-lote', { alegraIds: ids, categoriaId })
      if (!data?.success) throw new Error('no se pudo iniciar')
      setTrabajoCategoria({ jobId: data.jobId, total: data.total, hechos: 0, errores: [], terminado: false })
      sondear(data.jobId, ids)
      return true
    } catch (error) {
      console.error('Error iniciando el cambio de categoría en lote:', error)
      mostrarToast('error', error.response?.data?.message || 'No se pudo iniciar el cambio de categoría.')
      return false
    }
  }, [sondear, mostrarToast])

  const cerrarTrabajoCategoria = useCallback(() => {
    detenerSondeo()
    setTrabajoCategoria(null)
  }, [])

  return { moviendo, trabajoCategoria, moverASubcategoria, cambiarCategoria, cerrarTrabajoCategoria }
}
