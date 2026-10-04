import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import { productosService } from '../services/productosService'
import { conMiniaturasProxeadas } from '../utils/imagenSugeridaUtils'

const mensajeDe = (error, porDefecto) => error?.response?.data?.message || porDefecto

/**
 * La ficha de un producto en Gestión de Catálogo (rama independencia-alegra):
 * crear, editar, "otra marca", ocultar o dar de baja, la foto, y la pestaña
 * de categorías. Todo contra el maestro propio (/api/maestro).
 *
 * Era useGestionCatalogo sin la grilla paginada: la lista ahora es la del
 * rediseño (useListaCatalogo). Cuando algo cambia, se avisa con `alCambiar`
 * para que la lista y el árbol se recarguen; la foto nueva se pinta al toque
 * con `alPonerFoto`.
 *
 * Recibe las filas de la lista, que no traen la ficha entera (CABYS,
 * impuesto, unidad…): la ficha se pide por id antes de abrirla.
 *
 * "Agregar otra marca" no tiene un formulario aparte: abre el mismo de
 * producto con los datos del original y, al crearlo, sigue directo a elegirle
 * la foto.
 */
export function useFichaProducto({ mostrarToast, alCambiar, alPonerFoto }) {
  const [categorias, setCategorias] = useState([])
  const [impuestos, setImpuestos] = useState([])

  // { producto, plantilla }: producto para editar, plantilla para "otra marca", ninguno para uno nuevo.
  const [edicion, setEdicion] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [abriendo, setAbriendo] = useState(null)

  const [selectedProduct, setSelectedProduct] = useState(null)
  const [isImageModalOpen, setIsImageModalOpen] = useState(false)
  const [imageSuggestions, setImageSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [customSearchQuery, setCustomSearchQuery] = useState('')
  const [assigningImage, setAssigningImage] = useState(false)

  // Categorías e impuestos: se recargan después de cada cambio porque llevan
  // contadores. Si fallan, la pantalla igual funciona.
  const cargarAuxiliares = useCallback(async () => {
    try {
      const [cats, imps] = await Promise.all([productosService.categorias(), productosService.impuestos()])
      setCategorias(cats)
      setImpuestos(imps)
    } catch (error) {
      console.error('Error cargando categorías o impuestos:', error)
    }
  }, [])

  useEffect(() => { cargarAuxiliares() }, [cargarAuxiliares])

  const cambio = () => { alCambiar?.(); cargarAuxiliares() }

  /** La ficha completa de una fila de la lista (o de un producto recién creado). */
  const fichaDe = async (fila) => {
    const id = fila?.id
    setAbriendo(id)
    try {
      return await productosService.obtener(id)
    } finally {
      setAbriendo(null)
    }
  }

  // ─── Fotos ────────────────────────────────────────────────────────────
  const fetchImageSuggestions = async (query) => {
    setLoadingSuggestions(true)
    setImageSuggestions([])
    try {
      const response = await api.get('/catalogos/imagenes-sugeridas', { params: { q: query } })
      if (response.data?.success) setImageSuggestions(conMiniaturasProxeadas(response.data.images))
    } catch (error) {
      console.error('Error buscando imágenes:', error)
      mostrarToast('error', 'No se pudieron buscar sugerencias de imágenes')
    } finally {
      setLoadingSuggestions(false)
    }
  }

  /** Acepta la fila de la lista o la ficha: solo usa id y nombre. */
  const openImageSuggestions = (producto) => {
    const nombre = producto.nombre ?? producto.name
    setSelectedProduct({ id: producto.id, nombre, referencia: producto.referencia ?? producto.reference, imagen_url: producto.imagen_url ?? producto.original?.imagen_url ?? null })
    setCustomSearchQuery(nombre)
    setIsImageModalOpen(true)
    fetchImageSuggestions(nombre)
  }

  const handleAssignImage = async (img) => {
    setAssigningImage(true)
    try {
      const { imagen_url } = await productosService.imagenDesdeUrl(selectedProduct.id, img.url, img.thumbnailOriginal)
      alPonerFoto?.(selectedProduct.id, imagen_url)
      mostrarToast('success', 'Foto asignada.')
      setIsImageModalOpen(false)
    } catch (error) {
      mostrarToast('error', mensajeDe(error, 'No se pudo asignar la foto.'))
    } finally {
      setAssigningImage(false)
    }
  }

  const handleSubirArchivoImagen = async (file) => {
    if (file.size > 2 * 1024 * 1024) {
      mostrarToast('error', 'La imagen debe ser menor a 2 MB')
      return
    }
    if (!file.type.startsWith('image/')) {
      mostrarToast('error', 'Solo se permiten archivos de imagen')
      return
    }
    setAssigningImage(true)
    try {
      const { imagen_url } = await productosService.imagenDesdeArchivo(selectedProduct.id, file)
      alPonerFoto?.(selectedProduct.id, imagen_url)
      mostrarToast('success', 'Foto asignada.')
      setIsImageModalOpen(false)
    } catch (error) {
      mostrarToast('error', mensajeDe(error, 'No se pudo subir la foto.'))
    } finally {
      setAssigningImage(false)
    }
  }

  // ─── Productos ────────────────────────────────────────────────────────
  const abrirNuevo = () => setEdicion({ producto: null, plantilla: null })

  const abrirEditar = async (fila) => {
    try {
      setEdicion({ producto: await fichaDe(fila), plantilla: null })
    } catch (error) {
      mostrarToast('error', mensajeDe(error, 'No se pudo abrir el producto.'))
    }
  }

  const abrirOtraMarca = async (fila) => {
    let producto
    try {
      producto = await fichaDe(fila)
    } catch (error) {
      mostrarToast('error', mensajeDe(error, 'No se pudo abrir el producto.'))
      return
    }
    let referencia = producto.referencia ? `${producto.referencia}-` : ''
    try {
      // Contado sobre el maestro propio: la caché de Alegra no conoce las marcas agregadas acá.
      const { data } = await api.get('/maestro/productos/siguiente-referencia', { params: { base: producto.referencia || 'REF' } })
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
        mostrarToast('success', `Se guardó "${actualizado.nombre}".`)
      } else {
        const creado = await productosService.crear(datos)
        mostrarToast('success', `Se creó "${creado.nombre}".`)
        // Otra marca: lo que sigue casi siempre es ponerle su foto.
        if (plantilla) openImageSuggestions(creado)
      }
      cambio()
      return true
    } catch (error) {
      mostrarToast('error', mensajeDe(error, 'No se guardó el producto.'))
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
      mostrarToast('success', `"${actualizado.nombre}" ${texto}.`)
      cambio()
    } catch (error) {
      mostrarToast('error', mensajeDe(error, 'No se pudo cambiar el estado.'))
    } finally {
      setGuardando(false)
    }
  }

  // ─── Categorías (la pestaña) ──────────────────────────────────────────
  const guardarCategoria = async (id, valores) => {
    try {
      if (id) await productosService.editarCategoria(id, valores.nombre)
      else await productosService.crearCategoria(valores.nombre)
      cambio()
      mostrarToast('success', id ? 'Categoría renombrada.' : 'Categoría creada.')
      return true
    } catch (error) {
      mostrarToast('error', mensajeDe(error, 'No se guardó la categoría.'))
      return false
    }
  }

  const cambiarActivoCategoria = async (fila) => {
    try {
      await productosService.cambiarActivoCategoria(fila.id, !fila.activo)
      cambio()
      mostrarToast('success', fila.activo
        ? `"${fila.nombre}" ya no se ofrece para productos nuevos.`
        : `"${fila.nombre}" vuelve a estar disponible.`)
    } catch (error) {
      mostrarToast('error', mensajeDe(error, 'No se pudo cambiar la categoría.'))
    }
  }

  return {
    categorias, impuestos,
    edicion, guardando, abriendo, abrirNuevo, abrirEditar, abrirOtraMarca, cerrarEdicion,
    guardarProducto, cambiarEstadoProducto,
    selectedProduct, isImageModalOpen, setIsImageModalOpen,
    imageSuggestions, loadingSuggestions, customSearchQuery, setCustomSearchQuery, assigningImage,
    openImageSuggestions, fetchImageSuggestions, handleAssignImage, handleSubirArchivoImagen,
    guardarCategoria, cambiarActivoCategoria
  }
}
