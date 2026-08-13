import { useCallback, useEffect, useState } from 'react'
import { getResumenRentabilidad, getProductosRentabilidad, getTendenciaMargenes, getDeterioroMargenes } from '../services/rentabilidadService'

export const defaultFiltros = {
  categoria: 'todas',
  clasificacion: 'todas',
  clase: 'todas',
  search: '',
  superaTecho: false,
  page: 1,
  pageSize: 50
}

/**
 * Estado del Tablero de Rentabilidad. El resumen se carga una vez (KPIs +
 * desglose por categoría); la lista de productos se recarga cada vez que
 * cambian los filtros o la página.
 */
export function useRentabilidad() {
  const [resumen, setResumen] = useState(null)
  const [loadingResumen, setLoadingResumen] = useState(true)

  const [filtros, setFiltrosState] = useState(defaultFiltros)
  const [productos, setProductos] = useState([])
  const [totalProductos, setTotalProductos] = useState(0)
  const [loadingProductos, setLoadingProductos] = useState(false)
  const [error, setError] = useState(null)

  const cargarResumen = useCallback(async () => {
    setLoadingResumen(true)
    try {
      const data = await getResumenRentabilidad()
      setResumen(data)
    } catch (err) {
      setError(err.message || 'No se pudo cargar el resumen')
    } finally {
      setLoadingResumen(false)
    }
  }, [])

  const cargarProductos = useCallback(async (filtrosActuales) => {
    setLoadingProductos(true)
    try {
      const data = await getProductosRentabilidad(filtrosActuales)
      setProductos(data.data || [])
      setTotalProductos(data.total || 0)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los productos')
      setProductos([])
      setTotalProductos(0)
    } finally {
      setLoadingProductos(false)
    }
  }, [])

  useEffect(() => {
    cargarResumen()
  }, [cargarResumen])

  useEffect(() => {
    cargarProductos(filtros)
  }, [filtros, cargarProductos])

  // Cualquier cambio de filtro que no sea de página vuelve a la página 1 —
  // si no, se puede quedar viendo una página vacía tras filtrar.
  const setFiltros = useCallback((updater) => {
    setFiltrosState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      if (next.page === prev.page) next.page = 1
      return next
    })
  }, [])

  const setPagina = useCallback((page) => {
    setFiltrosState((prev) => ({ ...prev, page }))
  }, [])

  const resetFiltros = useCallback(() => setFiltrosState(defaultFiltros), [])

  // Monitoreo de márgenes: la serie de fotos semanales y el deterioro.
  const [tendencia, setTendencia] = useState(null)
  const [deterioro, setDeterioro] = useState(null)
  const [loadingMonitoreo, setLoadingMonitoreo] = useState(true)

  useEffect(() => {
    let vivo = true
    setLoadingMonitoreo(true)
    Promise.all([getTendenciaMargenes(), getDeterioroMargenes()])
      .then(([t, d]) => {
        if (!vivo) return
        if (t.success) setTendencia(t)
        if (d.success) setDeterioro(d)
      })
      .catch(err => console.error('Error cargando el monitoreo de márgenes:', err))
      .finally(() => { if (vivo) setLoadingMonitoreo(false) })
    return () => { vivo = false }
  }, [])

  return {
    tendencia,
    deterioro,
    loadingMonitoreo,
    resumen,
    loadingResumen,
    filtros,
    setFiltros,
    setPagina,
    resetFiltros,
    productos,
    totalProductos,
    loadingProductos,
    error,
    reload: () => { cargarResumen(); cargarProductos(filtros) }
  }
}
