import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'

/**
 * Categorías y subcategorías con sus conteos, en el orden canónico (GET
 * /maestro/arbol — el mismo orden que arma el catálogo del agente), qué
 * categoría se está mirando, y la edición de esa taxonomía (crear,
 * renombrar, reordenar, borrar). La edición vive en las propias tarjetas y
 * secciones de la pantalla, no en un modal aparte.
 *
 * Es el hook de `main` sobre el maestro propio. Las categorías se siguen
 * nombrando por su NOMBRE en la pantalla (así las cuelgan `subcategoria` y
 * `categoria_config`), pero al servidor viaja su id propio.
 *
 * REORDENAR Y RENOMBRAR SON OPTIMISTAS (el estado local cambia antes de que
 * vuelva el servidor): esperar la vuelta del PUT era el botón de subir/bajar
 * tardando ~3 s. CREAR Y BORRAR SÍ esperan: son acciones deliberadas.
 */
export function useTaxonomiaCatalogo() {
  const [arbol, setArbol] = useState([])
  const [loadingArbol, setLoadingArbol] = useState(true)
  const [categoriaActiva, setCategoriaActiva] = useState(null)
  // Qué bloque mirar dentro de la categoría activa: null = toda la categoría,
  // 'sin' = solo lo no clasificado, o el id de una subcategoría puntual.
  const [subFoco, setSubFoco] = useState(null)
  const [errorArbol, setErrorArbol] = useState(null)

  // El árbol de este momento, para pasar de nombre a id sin rehacer los callbacks.
  const arbolRef = useRef([])
  arbolRef.current = arbol
  const idDe = (nombre) => arbolRef.current.find((c) => c.name === nombre)?.id

  const cargarArbol = useCallback(async () => {
    setLoadingArbol(true)
    try {
      const { data } = await api.get('/maestro/arbol')
      const categorias = data?.success ? (data.data || []) : []
      setArbol(categorias)
      setErrorArbol(null)
      return categorias
    } catch (error) {
      console.error('Error cargando el árbol del catálogo:', error)
      setErrorArbol(error.response?.data?.message || 'No se pudieron cargar las categorías.')
      return []
    } finally {
      setLoadingArbol(false)
    }
  }, [])

  // Se entra por la cuadrícula de categorías (sin ninguna elegida), igual que
  // Cuentas por Cobrar o el reporte de proveedores entran por su lista.
  useEffect(() => {
    cargarArbol()
  }, [cargarArbol])

  /** `foco`: null = toda la categoría, 'sin' = lo no clasificado, o el id de una subcategoría. */
  const seleccionarCategoria = useCallback((nombre, foco = null) => {
    setCategoriaActiva(nombre)
    setSubFoco(foco)
  }, [])

  const enfocar = useCallback((foco) => setSubFoco(foco), [])

  const volverALista = useCallback(() => {
    setCategoriaActiva(null)
    setSubFoco(null)
  }, [])

  // --- categorías ---

  const crearCategoria = useCallback(async (nombre) => {
    const { data } = await api.post('/maestro/categorias', { nombre })
    await cargarArbol()
    return data?.data
  }, [cargarArbol])

  /** El nombre que se ve en los catálogos; el del sistema se cambia en la pestaña Categorías. */
  const renombrarCategoria = useCallback(async (categoria, nombreVisible) => {
    const id = idDe(categoria)
    setArbol((prev) => prev.map((c) => (c.name === categoria ? { ...c, nombreVisible: nombreVisible || categoria } : c)))
    try {
      await api.put(`/maestro/categorias/${id}/nombre-visible`, { nombreVisible })
    } catch (error) {
      console.error('Error renombrando categoría:', error)
      await cargarArbol()
    }
  }, [cargarArbol])

  const guardarImagenCategoria = useCallback(async (categoria, archivo) => {
    const id = idDe(categoria)
    if (!id) throw new Error('Recargá el catálogo antes de cambiar la imagen.')
    const form = new FormData()
    form.append('imagen', archivo)
    const { data } = await api.post(`/maestro/categorias/${id}/imagen`, form, { headers:{ 'Content-Type':'multipart/form-data' } })
    // Parchear por id, incluso si se cambió de categoría mientras guardaba.
    setArbol(prev => prev.map(c => c.id === id ? { ...c,imagen:data.data.imagen } : c))
    return data.data
  }, [])

  const quitarImagenCategoria = useCallback(async categoria => {
    const id = idDe(categoria)
    if (!id) throw new Error('Recargá el catálogo antes de cambiar la imagen.')
    const { data } = await api.delete(`/maestro/categorias/${id}/imagen`)
    setArbol(prev => prev.map(c => c.id === id ? { ...c,imagen:null } : c))
    return data.data
  }, [])

  /** `nombresEnOrden` es TODA la lista de categorías, en su orden final. */
  const reordenarCategorias = useCallback(async (nombresEnOrden) => {
    setArbol((prev) => {
      const porNombre = new Map(prev.map((c) => [c.name, c]))
      return nombresEnOrden.map((nombre, i) => ({ ...porNombre.get(nombre), name: nombre, orden: i }))
    })
    try {
      await api.put('/maestro/categorias-orden', { categorias: nombresEnOrden })
    } catch (error) {
      console.error('Error reordenando categorías:', error)
      await cargarArbol()
    }
  }, [cargarArbol])

  // --- subcategorías ---

  const crearSubcategoria = useCallback(async (categoria, nombre) => {
    const { data } = await api.post('/maestro/subcategorias', { categoriaId: idDe(categoria), nombre })
    const s = data?.data
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
      await api.put(`/maestro/subcategorias/${id}`, { nombre })
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
      await api.put('/maestro/subcategorias-orden', { categoriaId: idDe(categoria), ids: idsEnOrden })
    } catch (error) {
      console.error('Error reordenando subcategorías:', error)
      await cargarArbol()
    }
  }, [cargarArbol])

  /** Solo tiene sentido si ya está en 0 productos — el backend lo exige igual. */
  const eliminarSubcategoria = useCallback(async (categoria, id) => {
    await api.delete(`/maestro/subcategorias/${id}`)
    setArbol((prev) => prev.map((c) => (c.name === categoria
      ? { ...c, subcategorias: c.subcategorias.filter((s) => s.id !== id) }
      : c)))
    setSubFoco((prev) => (prev === id ? null : prev))
  }, [])

  return {
    arbol,
    loadingArbol,
    errorArbol,
    categoriaActiva,
    subFoco,
    seleccionarCategoria,
    enfocar,
    volverALista,
    crearCategoria,
    renombrarCategoria,
    guardarImagenCategoria,
    quitarImagenCategoria,
    reordenarCategorias,
    crearSubcategoria,
    renombrarSubcategoria,
    reordenarSubcategorias,
    eliminarSubcategoria,
    recargarArbol: cargarArbol
  }
}
