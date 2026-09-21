import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'

/**
 * El riel: categorías y subcategorías con sus conteos, en el orden canónico
 * (GET /catalog/arbol — el mismo orden que arma el catálogo del agente), más
 * la edición de esa taxonomía (crear, renombrar, reordenar, borrar).
 *
 * Reemplaza a ModalSubcategorias.jsx: la edición vive en el propio riel, no
 * en un modal aparte que tapa la pantalla mientras se administra.
 *
 * REORDENAR Y RENOMBRAR SON OPTIMISTAS (el estado local cambia antes de que
 * vuelva el servidor) — mismo criterio que ya tenía useGestionCatalogo.js:
 * esperar la vuelta del PUT era el botón de subir/bajar tardando ~3 s.
 * CREAR Y BORRAR SÍ esperan: son acciones deliberadas, no un hot path, y
 * crear categoría además escribe en Alegra (no es instantáneo).
 */
export function useTaxonomiaCatalogo() {
  const [arbol, setArbol] = useState([])
  const [loadingArbol, setLoadingArbol] = useState(true)
  const [categoriaActiva, setCategoriaActiva] = useState(null)
  // Qué bloque mirar dentro de la categoría activa: null = toda la categoría,
  // 'sin' = solo lo no clasificado, o el id de una subcategoría puntual.
  const [subFoco, setSubFoco] = useState(null)

  const cargarArbol = useCallback(async ({ conservarSeleccion = true } = {}) => {
    setLoadingArbol(true)
    try {
      const { data } = await api.get('/alegra/catalog/arbol')
      const categorias = data?.success ? (data.categorias || []) : []
      setArbol(categorias)
      if (!conservarSeleccion && categorias.length > 0) {
        setCategoriaActiva(categorias[0].name)
        setSubFoco(null)
      }
      return categorias
    } catch (error) {
      console.error('Error cargando el árbol del catálogo:', error)
      return []
    } finally {
      setLoadingArbol(false)
    }
  }, [])

  useEffect(() => {
    cargarArbol({ conservarSeleccion: false })
  }, [cargarArbol])

  const seleccionarCategoria = useCallback((nombre) => {
    setCategoriaActiva(nombre)
    setSubFoco(null)
  }, [])

  const seleccionarSubcategoria = useCallback((nombreCategoria, subId) => {
    setCategoriaActiva(nombreCategoria)
    setSubFoco(subId)
  }, [])

  const seleccionarSinClasificar = useCallback((nombreCategoria) => {
    setCategoriaActiva(nombreCategoria)
    setSubFoco('sin')
  }, [])

  const limpiarFoco = useCallback(() => setSubFoco(null), [])

  // --- categorías ---

  const crearCategoria = useCallback(async (nombre) => {
    const { data } = await api.post('/alegra/catalog/categorias-config/crear', { nombre })
    await cargarArbol()
    if (data?.categoria?.name) seleccionarCategoria(data.categoria.name)
    return data?.categoria
  }, [cargarArbol, seleccionarCategoria])

  const renombrarCategoria = useCallback(async (categoria, nombreVisible) => {
    setArbol((prev) => prev.map((c) => (c.name === categoria ? { ...c, nombreVisible: nombreVisible || categoria } : c)))
    try {
      await api.put('/alegra/catalog/categorias-config/nombre', { categoria, nombreVisible })
    } catch (error) {
      console.error('Error renombrando categoría:', error)
      await cargarArbol()
    }
  }, [cargarArbol])

  /** `nombresEnOrden` es TODA la lista de categorías, en su orden final. */
  const reordenarCategorias = useCallback(async (nombresEnOrden) => {
    setArbol((prev) => {
      const porNombre = new Map(prev.map((c) => [c.name, c]))
      return nombresEnOrden.map((nombre, i) => ({ ...porNombre.get(nombre), name: nombre, orden: i }))
    })
    try {
      await api.put('/alegra/catalog/categorias-config/orden', { categorias: nombresEnOrden })
    } catch (error) {
      console.error('Error reordenando categorías:', error)
      await cargarArbol()
    }
  }, [cargarArbol])

  // --- subcategorías ---

  const crearSubcategoria = useCallback(async (categoria, nombre) => {
    const { data } = await api.post('/alegra/catalog/subcategorias', { categoria, nombre })
    const s = data?.subcategoria
    if (s) {
      setArbol((prev) => prev.map((c) => (c.name === categoria
        ? { ...c, subcategorias: [...c.subcategorias, { id: s.id, nombre: s.nombre, orden: 0, activo: true, productos: 0 }] }
        : c)))
    }
    return s
  }, [])

  const renombrarSubcategoria = useCallback(async (categoria, id, nombre) => {
    setArbol((prev) => prev.map((c) => (c.name === categoria
      ? { ...c, subcategorias: c.subcategorias.map((s) => (s.id === id ? { ...s, nombre } : s)) }
      : c)))
    try {
      await api.put(`/alegra/catalog/subcategorias/${id}`, { nombre })
    } catch (error) {
      console.error('Error renombrando subcategoría:', error)
      await cargarArbol()
    }
  }, [cargarArbol])

  /** `idsEnOrden` es TODA la lista de subcategorías de esa categoría, en orden. */
  const reordenarSubcategorias = useCallback(async (categoria, idsEnOrden) => {
    setArbol((prev) => prev.map((c) => {
      if (c.name !== categoria) return c
      const porId = new Map(c.subcategorias.map((s) => [s.id, s]))
      const reordenadas = idsEnOrden.map((id, i) => ({ ...porId.get(id), orden: i })).filter((s) => s.id !== undefined)
      return { ...c, subcategorias: reordenadas }
    }))
    try {
      await api.put('/alegra/catalog/subcategorias-orden', { categoria, ids: idsEnOrden })
    } catch (error) {
      console.error('Error reordenando subcategorías:', error)
      await cargarArbol()
    }
  }, [cargarArbol])

  /** Solo tiene sentido si ya está en 0 productos — el backend lo exige igual. */
  const eliminarSubcategoria = useCallback(async (categoria, id) => {
    await api.delete(`/alegra/catalog/subcategorias/${id}`)
    setArbol((prev) => prev.map((c) => (c.name === categoria
      ? { ...c, subcategorias: c.subcategorias.filter((s) => s.id !== id) }
      : c)))
    setSubFoco((prev) => (prev === id ? null : prev))
  }, [])

  return {
    arbol,
    loadingArbol,
    categoriaActiva,
    subFoco,
    seleccionarCategoria,
    seleccionarSubcategoria,
    seleccionarSinClasificar,
    limpiarFoco,
    crearCategoria,
    renombrarCategoria,
    reordenarCategorias,
    crearSubcategoria,
    renombrarSubcategoria,
    reordenarSubcategorias,
    eliminarSubcategoria,
    recargarArbol: cargarArbol
  }
}
