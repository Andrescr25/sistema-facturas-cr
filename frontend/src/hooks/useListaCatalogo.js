import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../services/api'
import { compararSubcategorias, normalizarTexto } from '../utils/catalogoAgentePersonalizacion'

// Solo se demora la búsqueda global (para no mandar una petición por tecla,
// el bug arrastrado de la pantalla vieja): entrar a una categoría dispara al
// toque, no hay nada que esperar.
const RETRASO_BUSQUEDA_MS = 300
// La búsqueda es un atajo sobre todo el catálogo, como la del catálogo del
// agente: descarta el agrupado y muestra una lista plana.
const LIMITE_BUSQUEDA_GLOBAL = 100

/**
 * Los productos de lo que se está mirando.
 *
 *   · Dentro de una categoría: TODOS sus productos (GET /productos-de-categoria),
 *     repartidos en secciones por subcategoría. Las secciones salen del
 *     árbol —no de los productos— para que aparezcan también las
 *     subcategorías vacías: si no, una recién creada no se vería y no habría
 *     dónde renombrarla, moverla o borrarla. El orden es el del agente
 *     (compararSubcategorias, la misma función que usa partirPorSubcategoria),
 *     y "Sin clasificar" siempre al final.
 *   · En la cuadrícula, con texto en el buscador: búsqueda en todo el catálogo.
 *
 * UN SOLO EFECTO, NO DOS ENCADENADOS: la pantalla vieja disparaba una
 * petición de más en cada cambio de filtro por tener dos.
 */
export function useListaCatalogo({ arbol, categoriaActiva, subFoco }) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroTexto, setFiltroTexto] = useState('')
  const [soloSinImagen, setSoloSinImagen] = useState(false)
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)
  const [recargarNonce, setRecargarNonce] = useState(0)

  const busquedaActiva = !categoriaActiva && busqueda.trim().length > 0
  const idPedidoRef = useRef(0)

  // El filtro de adentro es de ESA categoría: al cambiar de una a otra no se arrastra.
  useEffect(() => { setFiltroTexto('') }, [categoriaActiva])

  useEffect(() => {
    const miId = ++idPedidoRef.current

    if (!categoriaActiva && !busquedaActiva) {
      setProductos([])
      setLoading(false)
      return
    }

    const disparar = () => {
      setLoading(true)
      const pedido = categoriaActiva
        ? api.get('/alegra/catalog/productos-de-categoria', { params: { categoria: categoriaActiva } })
        : api.get('/alegra/catalog/productos', { params: { search: busqueda.trim(), limit: LIMITE_BUSQUEDA_GLOBAL } })

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

    if (!categoriaActiva) {
      const t = setTimeout(disparar, RETRASO_BUSQUEDA_MS)
      return () => clearTimeout(t)
    }
    disparar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, busquedaActiva, categoriaActiva, recargarNonce])

  const recargar = useCallback(() => setRecargarNonce((n) => n + 1), [])

  const categoria = useMemo(
    () => arbol.find((c) => c.name === categoriaActiva) || null,
    [arbol, categoriaActiva]
  )

  const subsOrdenadas = useMemo(
    () => [...(categoria?.subcategorias || [])].sort(compararSubcategorias),
    [categoria]
  )

  const hayFiltro = Boolean(filtroTexto.trim()) || soloSinImagen

  const secciones = useMemo(() => {
    if (!categoriaActiva) return []

    const texto = normalizarTexto(filtroTexto)
    const visibles = productos.filter((p) =>
      (!soloSinImagen || !p.imageUrl) &&
      (!texto || normalizarTexto(`${p.name} ${p.reference || ''}`).includes(texto)))

    const porSub = new Map()
    const sueltos = []
    for (const p of visibles) {
      if (!p.subcategoria) { sueltos.push(p); continue }
      if (!porSub.has(p.subcategoria.id)) porSub.set(p.subcategoria.id, [])
      porSub.get(p.subcategoria.id).push(p)
    }

    const lista = subsOrdenadas.map((s) => ({
      clave: `s${s.id}`, sub: s, nombre: s.nombre, productos: porSub.get(s.id) || []
    }))

    // Productos colgados de una subcategoría que el árbol no trae (una
    // desactivada): no se esconden, tienen su propia sección.
    const conocidas = new Set(subsOrdenadas.map((s) => s.id))
    for (const [id, lista2] of porSub) {
      if (conocidas.has(id)) continue
      const nombre = lista2[0].subcategoria.nombre
      lista.push({ clave: `s${id}`, sub: { id, nombre, productos: lista2.length, inactiva: true }, nombre: `${nombre} (desactivada)`, productos: lista2 })
    }

    lista.push({ clave: 'sin', sub: null, nombre: 'Sin clasificar', sinClasificar: true, productos: sueltos })

    let resultado = lista
    if (subFoco === 'sin') resultado = lista.filter((s) => s.sinClasificar)
    else if (typeof subFoco === 'number') resultado = lista.filter((s) => s.sub?.id === subFoco)

    // Sin filtros se ven también las subcategorías vacías (para administrarlas);
    // "Sin clasificar" vacío no dice nada y no se muestra.
    return resultado.filter((s) => s.productos.length > 0 || (!hayFiltro && !s.sinClasificar))
  }, [productos, categoriaActiva, subsOrdenadas, filtroTexto, soloSinImagen, subFoco, hayFiltro])

  const resultados = useMemo(
    () => (busquedaActiva ? productos.filter((p) => !soloSinImagen || !p.imageUrl) : []),
    [busquedaActiva, productos, soloSinImagen]
  )

  /** Actualización local, para reflejar al toque una acción ya confirmada por el servidor. */
  const patchProducto = useCallback((alegraId, cambios) => {
    setProductos((prev) => prev.map((p) => (p.alegraId === alegraId ? { ...p, ...cambios } : p)))
  }, [])

  /** Cuando un producto deja de pertenecer a lo que se está mirando. */
  const quitarProductos = useCallback((alegraIds) => {
    const fuera = new Set(alegraIds)
    setProductos((prev) => prev.filter((p) => !fuera.has(p.alegraId)))
  }, [])

  return {
    busqueda, setBusqueda, busquedaActiva,
    filtroTexto, setFiltroTexto,
    soloSinImagen, setSoloSinImagen,
    hayFiltro,
    categoria,
    subsOrdenadas,
    secciones,
    resultados,
    loading,
    recargar,
    patchProducto,
    quitarProductos
  }
}
