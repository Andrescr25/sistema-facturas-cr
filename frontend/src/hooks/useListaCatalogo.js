import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../services/api'
import { partirPorSubcategoria } from '../utils/catalogoAgentePersonalizacion'

// Solo se demora la búsqueda de texto (para no mandar una petición por
// tecla, el bug arrastrado de la pantalla vieja): cambiar de categoría en el
// riel dispara al toque, no hay nada que esperar.
const RETRASO_BUSQUEDA_MS = 300
// La búsqueda es un atajo GLOBAL sobre todo el catálogo (como la del
// catálogo del agente: descarta el agrupado y muestra una lista plana). No
// es el camino principal de trabajo —ese es el riel—, así que un límite
// generoso alcanza sin tener que paginar.
const LIMITE_BUSQUEDA_GLOBAL = 100

/**
 * Los productos de la categoría/subcategoría activa (o de una búsqueda
 * global), agrupados en el MISMO orden canónico que el catálogo del agente
 * — ver partirPorSubcategoria en catalogoAgentePersonalizacion.js.
 *
 * UN SOLO EFECTO, NO DOS ENCADENADOS: la pantalla vieja perdía la página al
 * cambiar cualquier filtro con un efecto aparte, y eso disparaba una
 * petición de más en cada cambio.
 */
export function useListaCatalogo({ arbol, categoriaActiva, subFoco }) {
  const [busqueda, setBusqueda] = useState('')
  const [soloSinImagen, setSoloSinImagen] = useState(false)
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)
  const [recargarNonce, setRecargarNonce] = useState(0)

  const busquedaActiva = busqueda.trim().length > 0
  const idPedidoRef = useRef(0)

  useEffect(() => {
    const miId = ++idPedidoRef.current

    if (!busquedaActiva && !categoriaActiva) {
      setProductos([])
      return
    }

    const disparar = () => {
      setLoading(true)
      const pedido = busquedaActiva
        ? api.get('/alegra/catalog/productos', { params: { search: busqueda.trim(), limit: LIMITE_BUSQUEDA_GLOBAL } })
        : api.get('/alegra/catalog/productos-de-categoria', { params: { categoria: categoriaActiva } })

      pedido
        .then(({ data }) => {
          if (idPedidoRef.current !== miId) return // llegó tarde: ya no es lo que se está mirando
          setProductos(data?.success ? (data.data || []) : [])
        })
        .catch((error) => {
          if (idPedidoRef.current !== miId) return
          console.error('Error cargando productos del catálogo:', error)
          setProductos([])
        })
        .finally(() => {
          if (idPedidoRef.current === miId) setLoading(false)
        })
    }

    if (busquedaActiva) {
      const t = setTimeout(disparar, RETRASO_BUSQUEDA_MS)
      return () => clearTimeout(t)
    }
    disparar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, busquedaActiva, categoriaActiva, recargarNonce])

  const recargar = useCallback(() => setRecargarNonce((n) => n + 1), [])

  const productosFiltrados = useMemo(
    () => (soloSinImagen ? productos.filter((p) => !p.imageUrl) : productos),
    [productos, soloSinImagen]
  )

  // El orden de las subcategorías dentro del bloque sale del riel (ya viene
  // en orden canónico desde GET /arbol), no de un criterio propio acá.
  const configParaPartir = useMemo(() => {
    const cat = arbol.find((c) => c.name === categoriaActiva)
    if (!cat) return null
    return { subcategorias: cat.subcategorias.map((s) => ({ categoria: categoriaActiva, nombre: s.nombre, orden: s.orden })) }
  }, [arbol, categoriaActiva])

  /**
   * `null` cuando el llamador debe usar la lista plana `productosFiltrados`
   * (modo búsqueda, igual que el catálogo del agente descarta el agrupado).
   * Si no, un arreglo de bloques `{nombre, productos, sinClasificar?}`.
   */
  const bloques = useMemo(() => {
    if (busquedaActiva || !categoriaActiva) return null

    if (subFoco === 'sin') {
      const sueltos = productosFiltrados.filter((p) => !p.subcategoria)
      return sueltos.length ? [{ nombre: 'Sin clasificar', productos: sueltos, sinClasificar: true }] : []
    }
    if (typeof subFoco === 'number') {
      const propios = productosFiltrados.filter((p) => p.subcategoria?.id === subFoco)
      const nombreSub = arbol.find((c) => c.name === categoriaActiva)?.subcategorias.find((s) => s.id === subFoco)?.nombre
      return propios.length ? [{ nombre: nombreSub || 'Subcategoría', productos: propios }] : []
    }
    return partirPorSubcategoria(
      { [categoriaActiva]: productosFiltrados }, configParaPartir, { sinClasificarSiempre: true }
    )[categoriaActiva] || []
  }, [productosFiltrados, categoriaActiva, subFoco, configParaPartir, busquedaActiva, arbol])

  /** Actualización local, para reflejar al toque una acción ya confirmada por el servidor. */
  const patchProducto = useCallback((alegraId, cambios) => {
    setProductos((prev) => prev.map((p) => (p.alegraId === alegraId ? { ...p, ...cambios } : p)))
  }, [])

  /** Cuando un producto deja de pertenecer a lo que se está mirando (cambió de categoría, o se movió de bloque). */
  const quitarProductos = useCallback((alegraIds) => {
    const fuera = new Set(alegraIds)
    setProductos((prev) => prev.filter((p) => !fuera.has(p.alegraId)))
  }, [])

  return {
    busqueda, setBusqueda, busquedaActiva,
    soloSinImagen, setSoloSinImagen,
    productos: productosFiltrados,
    bloques,
    loading,
    recargar,
    patchProducto,
    quitarProductos
  }
}
