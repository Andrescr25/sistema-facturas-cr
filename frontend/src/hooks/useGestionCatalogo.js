import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import { productosService } from '../services/productosService'
import { conMiniaturasProxeadas } from '../utils/imagenSugeridaUtils'

const LIMIT = 24 // Grilla de 4x6

/**
 * Estado de Gestión de Catálogo (rama independencia-alegra).
 *
 * Todo va contra el maestro propio (/api/maestro): listar, crear, editar,
 * ocultar o desactivar, categorías y fotos. Ya no se escribe en Alegra ni se
 * sincroniza desde acá. El buscador de fotos sugeridas sigue igual: solo
 * busca; la foto elegida se guarda en el almacenamiento propio.
 *
 * "Agregar otra marca" ya no tiene un formulario aparte: abre el mismo de
 * producto con los datos del original y, al crearlo, sigue directo a elegirle
 * la foto.
 */
const mensajeDe = (error, porDefecto) => error?.response?.data?.message || porDefecto

export function useGestionCatalogo() {
  const [productos, setProductos] = useState([])
  const [totalProductos, setTotalProductos] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [missingImageOnly, setMissingImageOnly] = useState(false)
  const [proveedorFiltro, setProveedorFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('activos')
  const [proveedoresCatalogo, setProveedoresCatalogo] = useState({ proveedores: [], sinProveedor: null })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [categorias, setCategorias] = useState([])
  const [impuestos, setImpuestos] = useState([])

  // { producto, plantilla }: producto para editar, plantilla para "otra marca", ninguno para uno nuevo.
  const [edicion, setEdicion] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const [selectedProduct, setSelectedProduct] = useState(null)
  const [isImageModalOpen, setIsImageModalOpen] = useState(false)
  const [imageSuggestions, setImageSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [customSearchQuery, setCustomSearchQuery] = useState('')
  const [assigningImage, setAssigningImage] = useState(false)

  const [toast, setToast] = useState(null)
  const showToast = useCallback((type, message) => setToast({ type, message }), [])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const { productos: lista, paginacion } = await productosService.listar({
        buscar: searchQuery,
        sinImagen: missingImageOnly,
        proveedor: proveedorFiltro,
        estado: estadoFiltro,
        pagina: currentPage,
        limite: LIMIT
      })
      setProductos(lista)
      setTotalProductos(paginacion.total)
      setTotalPages(Math.max(paginacion.paginas, 1))
    } catch (error) {
      console.error('Error cargando productos:', error)
      showToast('error', mensajeDe(error, 'No se pudieron cargar los productos.'))
    } finally {
      setLoading(false)
    }
  }, [searchQuery, missingImageOnly, proveedorFiltro, estadoFiltro, currentPage, showToast])

  useEffect(() => { setCurrentPage(1) }, [searchQuery, missingImageOnly, proveedorFiltro, estadoFiltro])
  useEffect(() => { fetchProducts() }, [fetchProducts])

  // Proveedores, categorías e impuestos: se recargan después de cada cambio
  // porque llevan contadores. Si fallan, la grilla igual funciona.
  const cargarAuxiliares = useCallback(async () => {
    try {
      const [prov, cats, imps] = await Promise.all([
        productosService.proveedores(),
        productosService.categorias(),
        productosService.impuestos()
      ])
      setProveedoresCatalogo(prov)
      setCategorias(cats)
      setImpuestos(imps)
    } catch (error) {
      console.error('Error cargando proveedores, categorías o impuestos:', error)
    }
  }, [])

  useEffect(() => { cargarAuxiliares() }, [cargarAuxiliares])

  // ─── Fotos ────────────────────────────────────────────────────────────
  const fetchImageSuggestions = async (query) => {
    setLoadingSuggestions(true)
    setImageSuggestions([])
    try {
      const response = await api.get('/alegra/catalog/search-images', { params: { q: query } })
      if (response.data?.success) setImageSuggestions(conMiniaturasProxeadas(response.data.images))
    } catch (error) {
      console.error('Error buscando imágenes:', error)
      showToast('error', 'No se pudieron buscar sugerencias de imágenes')
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const openImageSuggestions = (producto) => {
    setSelectedProduct(producto)
    setCustomSearchQuery(producto.nombre)
    setIsImageModalOpen(true)
    fetchImageSuggestions(producto.nombre)
  }

  const ponerFoto = (id, imagen_url) => {
    setProductos(prev => prev.map(p => (p.id === id ? { ...p, imagen_url } : p)))
  }

  const handleAssignImage = async (img) => {
    setAssigningImage(true)
    try {
      const { imagen_url } = await productosService.imagenDesdeUrl(selectedProduct.id, img.url, img.thumbnailOriginal)
      ponerFoto(selectedProduct.id, imagen_url)
      showToast('success', 'Foto asignada.')
      setIsImageModalOpen(false)
    } catch (error) {
      showToast('error', mensajeDe(error, 'No se pudo asignar la foto.'))
    } finally {
      setAssigningImage(false)
    }
  }

  const handleSubirArchivoImagen = async (file) => {
    if (file.size > 2 * 1024 * 1024) {
      showToast('error', 'La imagen debe ser menor a 2 MB')
      return
    }
    if (!file.type.startsWith('image/')) {
      showToast('error', 'Solo se permiten archivos de imagen')
      return
    }
    setAssigningImage(true)
    try {
      const { imagen_url } = await productosService.imagenDesdeArchivo(selectedProduct.id, file)
      ponerFoto(selectedProduct.id, imagen_url)
      showToast('success', 'Foto asignada.')
      setIsImageModalOpen(false)
    } catch (error) {
      showToast('error', mensajeDe(error, 'No se pudo subir la foto.'))
    } finally {
      setAssigningImage(false)
    }
  }

  // ─── Productos ────────────────────────────────────────────────────────
  const abrirNuevo = () => setEdicion({ producto: null, plantilla: null })
  const abrirEditar = (producto) => setEdicion({ producto, plantilla: null })

  const abrirOtraMarca = async (producto) => {
    let referencia = producto.referencia ? `${producto.referencia}-` : ''
    try {
      const { data } = await api.get('/alegra/catalog/siguiente-referencia', { params: { base: producto.referencia || 'REF' } })
      if (data?.success) referencia = data.referencia
    } catch (error) {
      console.error('No se pudo calcular el siguiente código de marca:', error)
    }
    setEdicion({ producto: null, plantilla: { ...producto, referencia, nombreOriginal: producto.nombre } })
  }

  const cerrarEdicion = () => setEdicion(null)

  const guardarProducto = async (datos) => {
    const { producto, plantilla } = edicion
    setGuardando(true)
    try {
      if (producto) {
        const actualizado = await productosService.editar(producto.id, datos)
        setProductos(prev => prev.map(p => (p.id === actualizado.id ? actualizado : p)))
        showToast('success', `Se guardó "${actualizado.nombre}".`)
      } else {
        const creado = await productosService.crear(datos)
        showToast('success', `Se creó "${creado.nombre}".`)
        await fetchProducts()
        // Otra marca: lo que sigue casi siempre es ponerle su foto.
        if (plantilla) openImageSuggestions(creado)
      }
      cargarAuxiliares()
      return true
    } catch (error) {
      showToast('error', mensajeDe(error, 'No se guardó el producto.'))
      return false
    } finally {
      setGuardando(false)
    }
  }

  const cambiarEstadoProducto = async (cambios) => {
    setGuardando(true)
    try {
      const actualizado = await productosService.cambiarEstado(edicion.producto.id, cambios)
      setEdicion({ producto: actualizado, plantilla: null })
      const texto = 'activo' in cambios
        ? (actualizado.activo ? 'vuelve a la venta' : 'ya no se puede vender')
        : (actualizado.oculto ? 'ya no aparece en los catálogos de clientes' : 'vuelve a aparecer en los catálogos')
      showToast('success', `"${actualizado.nombre}" ${texto}.`)
      await fetchProducts()
      cargarAuxiliares()
    } catch (error) {
      showToast('error', mensajeDe(error, 'No se pudo cambiar el estado.'))
    } finally {
      setGuardando(false)
    }
  }

  // ─── Categorías ───────────────────────────────────────────────────────
  const guardarCategoria = async (id, valores) => {
    try {
      if (id) await productosService.editarCategoria(id, valores.nombre)
      else await productosService.crearCategoria(valores.nombre)
      await cargarAuxiliares()
      showToast('success', id ? 'Categoría renombrada.' : 'Categoría creada.')
      return true
    } catch (error) {
      showToast('error', mensajeDe(error, 'No se guardó la categoría.'))
      return false
    }
  }

  const cambiarActivoCategoria = async (fila) => {
    try {
      await productosService.cambiarActivoCategoria(fila.id, !fila.activo)
      await cargarAuxiliares()
      showToast('success', fila.activo
        ? `"${fila.nombre}" ya no se ofrece para productos nuevos.`
        : `"${fila.nombre}" vuelve a estar disponible.`)
    } catch (error) {
      showToast('error', mensajeDe(error, 'No se pudo cambiar la categoría.'))
    }
  }

  return {
    productos, totalProductos, loading,
    searchQuery, setSearchQuery,
    missingImageOnly, setMissingImageOnly,
    proveedorFiltro, setProveedorFiltro, proveedoresCatalogo,
    estadoFiltro, setEstadoFiltro,
    currentPage, setCurrentPage, totalPages,

    categorias, impuestos,

    edicion, guardando, abrirNuevo, abrirEditar, abrirOtraMarca, cerrarEdicion,
    guardarProducto, cambiarEstadoProducto,

    selectedProduct, isImageModalOpen, setIsImageModalOpen,
    imageSuggestions, loadingSuggestions, customSearchQuery, setCustomSearchQuery, assigningImage,
    openImageSuggestions, fetchImageSuggestions, handleAssignImage, handleSubirArchivoImagen,

    guardarCategoria, cambiarActivoCategoria,

    toast, setToast
  }
}
