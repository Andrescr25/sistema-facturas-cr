import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../services/api'
import { compararSubcategorias, normalizarTexto } from '../utils/catalogoAgentePersonalizacion'
import { urlArchivo } from '../utils/urlArchivo'
import { ordenarPresentacionesMarcadas } from '../utils/marcasCatalogo'

// Solo se demora la búsqueda global (para no mandar una petición por tecla):
// entrar a una categoría dispara al toque, no hay nada que esperar.
const RETRASO_BUSQUEDA_MS = 300
// La búsqueda es un atajo sobre todo el catálogo, como la del catálogo del
// agente: descarta el agrupado y muestra una lista plana.
const LIMITE_BUSQUEDA_GLOBAL = 100
// Con un proveedor o un estado elegido se trae todo lo suyo.
const LIMITE_POR_FILTRO = 1000

/**
 * La fila del maestro propio con los nombres que usan los componentes de la
 * pantalla (FilaProducto y compañía, que vinieron de `main` con los nombres
 * de la caché de Alegra). ÚNICO lugar donde se traduce: el id es el PROPIO.
 * `original` es la fila tal como la manda el servidor, para la ficha.
 */
function aFila(p) {
  return {
    id: p.id,
    name: p.nombre,
    reference: p.referencia,
    imageUrl: p.imagen_url ? urlArchivo(p.imagen_url) : null,
    cost: p.costo_con_iva,
    category: p.categoria,
    precioConIva: p.precio_con_iva,
    margenReal: p.margen_real,
    unidadesMes: p.unidades_mes,
    proveedor: p.proveedor,
    subcategoria: p.subcategoria,
    marca: p.marca_catalogo_id ? { id: p.marca_catalogo_id } : null,
    activo: p.activo,
    oculto: p.oculto,
    original: p
  }
}

/**
 * Los productos de lo que se está mirando.
 *
 *   · Dentro de una categoría: TODOS sus productos a la vista, repartidos en
 *     secciones por subcategoría. Las secciones salen del árbol —no de los
 *     productos— para que aparezcan también las subcategorías vacías. El
 *     orden es el del agente (compararSubcategorias) y "Sin clasificar"
 *     siempre al final.
 *   · En la cuadrícula, con texto en el buscador, un proveedor o un estado
 *     que no sea "a la venta": lista plana sobre todo el catálogo. Los
 *     ocultos y los dados de baja SOLO se ven por acá: las categorías cuentan
 *     lo que está a la vista, igual que el catálogo del agente.
 *
 * UN SOLO EFECTO, NO DOS ENCADENADOS.
 */
export function useListaCatalogo({ arbol, categoriaActiva, subFoco }) {
  const [busqueda, setBusqueda] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [estado, setEstado] = useState('activos')
  const [proveedores, setProveedores] = useState({ proveedores: [], sinProveedor: null })
  const [filtroTexto, setFiltroTexto] = useState('')
  const [soloSinImagen, setSoloSinImagen] = useState(false)
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)
  const [recargarNonce, setRecargarNonce] = useState(0)

  const busquedaActiva = !categoriaActiva && (busqueda.trim().length > 0 || Boolean(proveedor) || estado !== 'activos')
  const idPedidoRef = useRef(0)

  const categoria = useMemo(
    () => arbol.find((c) => c.name === categoriaActiva) || null,
    [arbol, categoriaActiva]
  )
  const categoriaId = categoria?.id

  // Una vez: si no carga, el filtro simplemente no se muestra.
  useEffect(() => {
    api.get('/maestro/productos/proveedores')
      .then(({ data }) => {
        if (data?.success) setProveedores({ proveedores: data.data?.proveedores || [], sinProveedor: data.data?.sinProveedor || null })
      })
      .catch((error) => console.error('Error cargando proveedores del catálogo:', error))
  }, [])

  // El filtro de adentro es de ESA categoría: al cambiar de una a otra no se arrastra.
  useEffect(() => { setFiltroTexto('') }, [categoriaActiva])

  useEffect(() => {
    const miId = ++idPedidoRef.current

    if ((!categoriaActiva || !categoriaId) && !busquedaActiva) {
      setProductos([])
      setLoading(false)
      return
    }

    const disparar = () => {
      setLoading(true)
      const pedido = categoriaActiva
        ? api.get(`/maestro/categorias/${categoriaId}/productos`)
        : api.get('/maestro/buscar', {
            params: {
              buscar: busqueda.trim(),
              proveedor,
              estado,
              limite: proveedor || estado !== 'activos' ? LIMITE_POR_FILTRO : LIMITE_BUSQUEDA_GLOBAL
            }
          })

      pedido
        .then(({ data }) => {
          if (idPedidoRef.current !== miId) return // llegó tarde: ya no es lo que se está mirando
          setProductos(data?.success ? (data.data || []).map(aFila) : [])
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
  }, [busqueda, proveedor, estado, busquedaActiva, categoriaActiva, categoriaId, recargarNonce])

  const recargar = useCallback(() => setRecargarNonce((n) => n + 1), [])

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
      clave: `s${s.id}`, sub: s, nombre: s.nombre, productos: ordenarPresentacionesMarcadas(porSub.get(s.id) || [])
    }))

    // Productos colgados de una subcategoría que el árbol no trae (una
    // desactivada): no se esconden, tienen su propia sección.
    const conocidas = new Set(subsOrdenadas.map((s) => s.id))
    for (const [id, lista2] of porSub) {
      if (conocidas.has(id)) continue
      const nombre = lista2[0].subcategoria.nombre
      lista.push({ clave: `s${id}`, sub: { id, nombre, productos: lista2.length, inactiva: true }, nombre: `${nombre} (desactivada)`, productos: ordenarPresentacionesMarcadas(lista2) })
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
  const patchProducto = useCallback((id, cambios) => {
    setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)))
  }, [])

  /** Cuando un producto deja de pertenecer a lo que se está mirando. */
  const quitarProductos = useCallback((ids) => {
    const fuera = new Set(ids)
    setProductos((prev) => prev.filter((p) => !fuera.has(p.id)))
  }, [])

  return {
    busqueda, setBusqueda, busquedaActiva,
    proveedor, setProveedor, proveedores,
    estado, setEstado,
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
