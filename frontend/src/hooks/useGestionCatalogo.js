import { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import { conMiniaturasProxeadas } from '../utils/imagenSugeridaUtils'

const LIMIT = 24 // Grilla de 4x6

/**
 * Estado y lógica de negocio de la gestión de catálogo: listado paginado con
 * búsqueda/filtro, sincronización con Alegra, sugerencia de imágenes,
 * duplicación de producto por marca, y edición/eliminación de producto.
 * Extraído de GestionCatalogo.jsx.
 *
 * El toast (un solo mensaje a la vez, con <Toast/>) se mantiene igual que en
 * el original — esta página no tenía window.confirm/prompt/alert que migrar
 * a useDialog()/useToast().
 */
export function useGestionCatalogo() {
  // State variables
  const [productos, setProductos] = useState([])
  const [totalProductos, setTotalProductos] = useState(0)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [missingImageOnly, setMissingImageOnly] = useState(false)
  // Cédula del proveedor ('' = todos). Las opciones vienen del propio catálogo:
  // solo proveedores que tienen productos, con cuántos.
  const [proveedorFiltro, setProveedorFiltro] = useState('')

  // Subcategorías: son NUESTRAS, no de Alegra. Sirven para partir las bolsas
  // grandes —"Productos de PVC" son 118 piezas con sanitario, potable, conduit
  // y pegamentos revueltos— y se crean a gusto dentro de cualquier categoría.
  const [subcategorias, setSubcategorias] = useState([])
  const [subcategoriaFiltro, setSubcategoriaFiltro] = useState('')
  const [proveedoresCatalogo, setProveedoresCatalogo] = useState({ proveedores: [], sinProveedor: null })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Modal States
  const [isImageModalOpen, setIsImageModalOpen] = useState(false)
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // Selected product state
  const [selectedProduct, setSelectedProduct] = useState(null)

  // Image Suggestion States
  const [imageSuggestions, setImageSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [customSearchQuery, setCustomSearchQuery] = useState('')
  const [assigningImage, setAssigningImage] = useState(false)

  // Duplication Modal States
  const [newProductName, setNewProductName] = useState('')
  const [brandRef, setBrandRef] = useState('')
  const [brandPrice, setBrandPrice] = useState(0)
  const [brandCost, setBrandCost] = useState(0)
  const [brandImageUrl, setBrandImageUrl] = useState('')
  const [brandSuggestions, setBrandSuggestions] = useState([])
  const [loadingBrandSuggestions, setLoadingBrandSuggestions] = useState(false)
  const [creatingDuplicate, setCreatingDuplicate] = useState(false)

  // Edit Modal States
  const [editName, setEditName] = useState('')
  const [editRef, setEditRef] = useState('')
  const [editPrice, setEditPrice] = useState(0)
  const [editCost, setEditCost] = useState(0)
  const [editCategoria, setEditCategoria] = useState('')
  const [categorias, setCategorias] = useState([])
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete product states
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState(false)

  // Toast / Messages state
  const [toast, setToast] = useState(null)

  // Toast helper
  const showToast = (type, message) => {
    setToast({ type, message })
  }

  // El mismo listado que `subcategorias`, pero legible YA, sin esperar el
  // re-render. Hace falta porque al crear una subcategoría se la asigna
  // enseguida al producto, y en ese instante el estado todavía tiene la lista
  // vieja: buscar ahí la recién creada no la encuentra.
  const subcategoriasRef = useRef([])

  // Load products
  const cargarSubcategorias = async () => {
    try {
      // Las categorías se cargaban solo al abrir un producto. Sin esto, el
      // administrador de subcategorías abría con el desplegable vacío y no se
      // podía crear ninguna sin pasar antes por una ficha.
      loadCategorias()

      const { data } = await api.get('/alegra/catalog/subcategorias')
      const lista = data?.success ? (data.subcategorias || []) : []
      subcategoriasRef.current = lista
      setSubcategorias(lista)
      return lista
    } catch {
      // Sin subcategorías el catálogo se sigue usando como hasta ahora.
      subcategoriasRef.current = []
      setSubcategorias([])
      return []
    }
  }

  const crearSubcategoria = async (categoria, nombre) => {
    const { data } = await api.post('/alegra/catalog/subcategorias', { categoria, nombre })
    await cargarSubcategorias()
    return data.subcategoria
  }

  const renombrarSubcategoria = async (id, nombre) => {
    await api.put(`/alegra/catalog/subcategorias/${id}`, { nombre })
    await cargarSubcategorias()
  }

  const desactivarSubcategoria = async (id, activo) => {
    await api.put(`/alegra/catalog/subcategorias/${id}`, { activo })
    await cargarSubcategorias()
  }

  /**
   * Ponerle o quitarle la subcategoría a un producto. `null` la quita.
   *
   * LA PANTALLA SE ACTUALIZA A MANO, y no hacerlo era el bug de "la
   * subcategoría no deja clickearse": el desplegable está controlado por
   * `producto.subcategoria`, pero acá solo se recargaba la LISTA de
   * subcategorías —que no cambia al asignar—. El producto seguía con la
   * vieja, así que al elegir una opción el desplegable se devolvía solo y
   * parecía muerto, cuando en la base ya había quedado guardada.
   */
  const asignarSubcategoria = async (alegraId, subcategoriaId) => {
    await api.put(`/alegra/catalog/productos/${alegraId}/subcategoria`, { subcategoriaId })

    const id = subcategoriaId ? Number(subcategoriaId) : null
    const s = id ? subcategoriasRef.current.find(x => x.id === id) : null
    const puesta = s ? { id: s.id, nombre: s.nombre } : null

    setProductos(prev => prev.map(p => (p.alegraId === alegraId ? { ...p, subcategoria: puesta } : p)))
    setSelectedProduct(prev => (prev?.alegraId === alegraId ? { ...prev, subcategoria: puesta } : prev))
  }

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const response = await api.get('/alegra/catalog/productos', {
        params: {
          search: searchQuery,
          missingImageOnly: missingImageOnly.toString(),
          proveedor: proveedorFiltro,
          subcategoria: subcategoriaFiltro,
          page: currentPage.toString(),
          limit: LIMIT.toString()
        }
      })
      if (response.data?.success) {
        setProductos(response.data.data)
        setTotalProductos(response.data.pagination.total)
        setTotalPages(response.data.pagination.pages)
      }
    } catch (error) {
      console.error('Error fetching products:', error)
      showToast('error', 'Error al cargar los productos de la base de datos')
    } finally {
      setLoading(false)
    }
  }

  // Debounced search trigger or trigger on dependencies change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, missingImageOnly, proveedorFiltro, subcategoriaFiltro])

  useEffect(() => {
    fetchProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchQuery, missingImageOnly, proveedorFiltro, subcategoriaFiltro])

  // Las opciones del filtro. Si falla, el filtro simplemente no aparece: no
  // vale un aviso de error que tape el catálogo, que sí cargó.
  const fetchProveedoresCatalogo = async () => {
    try {
      const response = await api.get('/alegra/catalog/proveedores')
      if (response.data?.success) {
        setProveedoresCatalogo({
          proveedores: response.data.proveedores || [],
          sinProveedor: response.data.sinProveedor || null
        })
      }
    } catch (error) {
      console.error('Error cargando proveedores del catálogo:', error)
    }
  }

  useEffect(() => {
    fetchProveedoresCatalogo()
    cargarSubcategorias()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Synchronize Cache with Alegra API
  const handleSyncCatalog = async () => {
    setSyncing(true)
    showToast('info', 'Sincronizando inventario con Alegra... Por favor espere.')
    try {
      // Trae todo el catálogo paginado de Alegra (2000+ productos) — en
      // producción ya se vio tardar más de 3 minutos, por eso el mismo
      // timeout largo que ya usa Excesos para el mismo tipo de operación.
      const response = await api.post('/alegra/sincronizar/cache-productos', {}, { timeout: 10 * 60 * 1000 })
      if (response.data?.success) {
        showToast('success', `Sincronización finalizada. ${response.data.count} productos cargados.`)
        fetchProducts()
      } else {
        showToast('error', 'La sincronización de productos falló')
      }
    } catch (error) {
      console.error('Sync catalog error:', error)
      showToast('error', 'Error del servidor durante la sincronización')
    } finally {
      setSyncing(false)
    }
  }

  // --- IMAGE SUGGESTIONS ACTION ---
  const fetchImageSuggestions = async (query) => {
    setLoadingSuggestions(true)
    setImageSuggestions([])
    try {
      const response = await api.get('/alegra/catalog/search-images', {
        params: { q: query }
      })
      if (response.data?.success) {
        setImageSuggestions(conMiniaturasProxeadas(response.data.images))
      }
    } catch (error) {
      console.error('Error searching images:', error)
      showToast('error', 'No se pudieron buscar sugerencias de imágenes')
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const openImageSuggestions = async (product) => {
    setSelectedProduct(product)
    setCustomSearchQuery(product.name)
    setIsImageModalOpen(true)
    fetchImageSuggestions(product.name)
  }

  const handleAssignImage = async (img) => {
    setAssigningImage(true)
    try {
      const response = await api.post('/alegra/catalog/upload-image-url', {
        alegraId: selectedProduct.alegraId,
        imageUrl: img.url,
        fallbackImageUrl: img.thumbnailOriginal
      })

      if (response.data?.success) {
        const finalImageUrl = response.data.imageUrl || img.url
        showToast('success', 'Imagen asignada correctamente')
        // Update product in local state
        setProductos(prev => prev.map(p => {
          if (p.alegraId === selectedProduct.alegraId) {
            return { ...p, imageUrl: finalImageUrl }
          }
          return p
        }))
        setIsImageModalOpen(false)
      }
    } catch (error) {
      console.error('Error assigning image:', error)
      showToast('error', error.response?.data?.message || 'Error al asociar la imagen al producto en Alegra')
    } finally {
      setAssigningImage(false)
    }
  }

  const handleSubirArchivoImagen = async (file) => {
    if (file.size > 2 * 1024 * 1024) {
      showToast('error', 'La imagen debe ser menor a 2MB')
      return
    }
    if (!file.type.startsWith('image/')) {
      showToast('error', 'Solo se permiten archivos de imagen')
      return
    }

    setAssigningImage(true)
    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await api.post(`/alegra/catalog/upload-image-file/${selectedProduct.alegraId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      if (response.data?.success) {
        const finalImageUrl = response.data.imageUrl
        showToast('success', 'Imagen asignada correctamente')
        setProductos(prev => prev.map(p => {
          if (p.alegraId === selectedProduct.alegraId) {
            return { ...p, imageUrl: finalImageUrl }
          }
          return p
        }))
        setIsImageModalOpen(false)
      }
    } catch (error) {
      console.error('Error uploading image file:', error)
      showToast('error', error.response?.data?.message || 'Error al subir la imagen al producto en Alegra')
    } finally {
      setAssigningImage(false)
    }
  }

  // --- BRAND DUPLICATION ACTION ---
  const openBrandDuplication = async (product) => {
    setSelectedProduct(product)
    setNewProductName(product.name)
    // Provisional mientras responde el backend, para que el campo no quede
    // vacío si la consulta tarda o falla.
    setBrandRef(`${product.reference || 'REF'}-`)
    try {
      const { data } = await api.get('/alegra/catalog/siguiente-referencia', {
        params: { base: product.reference || 'REF' }
      })
      if (data?.success) setBrandRef(data.referencia)
    } catch (error) {
      console.error('No se pudo calcular el siguiente código de marca:', error)
    }
    setBrandPrice(product.price || 0)
    setBrandCost(product.cost || 0)
    setBrandImageUrl('')
    setBrandSuggestions([])
    setIsBrandModalOpen(true)
  }

  // Fetch image suggestions using the (already edited) product name as query
  const handleBrandSearchSuggestions = async () => {
    if (!newProductName.trim()) {
      showToast('info', 'Escribe el nombre del producto primero para buscar sugerencias.')
      return
    }
    setLoadingBrandSuggestions(true)
    setBrandSuggestions([])
    try {
      const response = await api.get('/alegra/catalog/search-images', {
        params: { q: newProductName.trim() }
      })
      if (response.data?.success) {
        setBrandSuggestions(conMiniaturasProxeadas(response.data.images))
      }
    } catch (error) {
      console.error('Error searching brand images:', error)
      showToast('error', 'No se pudieron buscar sugerencias de imagen')
    } finally {
      setLoadingBrandSuggestions(false)
    }
  }

  const handleNewProductNameChange = (e) => {
    setNewProductName(e.target.value)
  }

  const handleDuplicateBrand = async (e) => {
    e.preventDefault()
    if (!newProductName.trim()) {
      showToast('error', 'El nombre del producto es obligatorio')
      return
    }
    if (!brandRef.trim()) {
      showToast('error', 'La referencia/código es obligatoria')
      return
    }

    setCreatingDuplicate(true)
    try {
      const response = await api.post('/alegra/catalog/duplicate-brand', {
        originalProductId: selectedProduct.alegraId,
        name: newProductName.trim(),
        newCode: brandRef.trim(),
        newPrice: brandPrice,
        newCost: brandCost,
        imageUrl: brandImageUrl
      })

      if (response.data?.success) {
        showToast('success', `"${newProductName.trim()}" creado exitosamente.`)
        setIsBrandModalOpen(false)
        fetchProducts() // Refresh list to show newly created item
      }
    } catch (error) {
      console.error('Error duplicating brand product:', error)
      showToast('error', error.response?.data?.message || 'Error del servidor al duplicar el producto')
    } finally {
      setCreatingDuplicate(false)
    }
  }

  // --- EDIT PRODUCT ACTION ---
  // Categorías de producto (Alegra item-categories), con el orden y el
  // nombre visible que se hayan configurado en Gestión de Catálogo. `name` es
  // el real de Alegra y no cambia nunca: es lo que sigue viajando en
  // `producto.category` y en `subcategoria.categoria`.
  const cargarCategorias = async () => {
    try {
      const response = await api.get('/alegra/catalog/categorias-config')
      const cats = response.data?.success ? (response.data.categorias || []) : []
      setCategorias(cats)
      return cats
    } catch (err) {
      console.error('Error cargando categorías:', err)
      setCategorias([])
      return []
    }
  }

  // Cargadas una sola vez: la pantalla de edición de producto no necesita
  // volver a pedirlas cada vez que se abre.
  const loadCategorias = async () => {
    if (categorias.length > 0) return categorias
    return cargarCategorias()
  }

  // Optimista: el nombre/orden se ve cambiado YA, sin esperar la vuelta del
  // servidor — antes esperaba el PUT y encima volvía a pedir la lista entera
  // (con categorías, esa segunda vuelta le preguntaba a Alegra), y ese doble
  // viaje era el botón de mover/renombrar tardando ~3 s en reaccionar.
  const renombrarCategoria = async (categoria, nombreVisible) => {
    setCategorias(prev => prev.map(c => (c.name === categoria ? { ...c, nombreVisible: nombreVisible || categoria } : c)))
    try {
      const { data } = await api.put('/alegra/catalog/categorias-config/nombre', { categoria, nombreVisible })
      if (data?.success) {
        setCategorias(prev => prev.map(c => (c.name === categoria ? { ...c, nombreVisible: data.nombreVisible } : c)))
      }
    } catch (err) {
      console.error('Error renombrando categoría:', err)
      await cargarCategorias() // se perdió: se vuelve a pedir la real
    }
  }

  /** `nombresEnOrden` es la lista COMPLETA de categorías en su orden final. */
  const reordenarCategorias = async (nombresEnOrden) => {
    setCategorias(prev => {
      const porNombre = new Map(prev.map(c => [c.name, c]))
      return nombresEnOrden.map((nombre, i) => ({ ...porNombre.get(nombre), name: nombre, orden: i }))
    })
    try {
      const { data } = await api.put('/alegra/catalog/categorias-config/orden', { categorias: nombresEnOrden })
      if (data?.success) {
        // La respuesta no trae `id` (reordenar no le vuelve a preguntar a
        // Alegra, ver categorias.service.js): se conserva el que ya se tenía.
        setCategorias(prev => {
          const porNombre = new Map(prev.map(c => [c.name, c]))
          return data.categorias.map(c => ({ ...porNombre.get(c.name), ...c }))
        })
      }
    } catch (err) {
      console.error('Error reordenando categorías:', err)
      await cargarCategorias()
    }
  }

  /** `idsEnOrden` es TODA la lista de subcategorías de esa categoría, en orden. */
  const reordenarSubcategorias = async (categoria, idsEnOrden) => {
    setSubcategorias(prev => {
      const porId = new Map(prev.map(s => [s.id, s]))
      const reordenadas = idsEnOrden.map((id, i) => ({ ...porId.get(id), orden: i })).filter(s => s.id !== undefined)
      const otras = prev.filter(s => s.categoria !== categoria)
      const lista = [...otras, ...reordenadas]
      subcategoriasRef.current = lista
      return lista
    })
    try {
      const { data } = await api.put('/alegra/catalog/subcategorias-orden', { categoria, ids: idsEnOrden })
      if (data?.success) {
        setSubcategorias(prev => {
          const otras = prev.filter(s => s.categoria !== categoria)
          const lista = [...otras, ...data.subcategorias]
          subcategoriasRef.current = lista
          return lista
        })
      }
    } catch (err) {
      console.error('Error reordenando subcategorías:', err)
      await cargarSubcategorias()
    }
  }

  const openEditProduct = async (product) => {
    setSelectedProduct(product)
    setEditName(product.name)
    setEditRef(product.reference || '')
    setEditPrice(product.price || 0)
    setEditCost(product.cost || 0)
    setIsEditModalOpen(true)

    const cats = await loadCategorias()
    const categoriaActual = cats.find((cat) => cat.name === product.category)
    setEditCategoria(categoriaActual ? String(categoriaActual.id) : '')
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editName.trim()) {
      showToast('error', 'El nombre es requerido')
      return
    }
    if (!editRef.trim()) {
      showToast('error', 'La referencia es requerida')
      return
    }

    setSavingEdit(true)
    try {
      const response = await api.put(`/alegra/catalog/productos/${selectedProduct.alegraId}`, {
        name: editName.trim(),
        reference: editRef.trim(),
        price: editPrice,
        cost: editCost,
        category: editCategoria || undefined
      })

      if (response.data?.success) {
        showToast('success', 'Producto actualizado correctamente')
        const categoriaNueva = categorias.find((cat) => String(cat.id) === String(editCategoria))
        // Update product list state locally
        setProductos(prev => prev.map(p => {
          if (p.alegraId === selectedProduct.alegraId) {
            return {
              ...p,
              name: editName.trim(),
              reference: editRef.trim(),
              price: parseFloat(editPrice),
              cost: parseFloat(editCost),
              category: categoriaNueva ? categoriaNueva.name : p.category
            }
          }
          return p
        }))
        setIsEditModalOpen(false)
      }
    } catch (error) {
      console.error('Error saving edits:', error)
      showToast('error', error.response?.data?.message || 'Error al guardar los cambios en el servidor')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteProduct = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeletingProduct(true)
    try {
      const response = await api.delete(`/alegra/catalog/productos/${selectedProduct.alegraId}`)
      if (response.data?.success) {
        const message = response.data.hidden
          ? `"${selectedProduct.name}" tiene facturas asociadas en Alegra y no se puede eliminar, se ocultó del catálogo`
          : `Producto "${selectedProduct.name}" eliminado correctamente`
        showToast(response.data.hidden ? 'info' : 'success', message)
        setProductos(prev => prev.filter(p => p.alegraId !== selectedProduct.alegraId))
        setTotalProductos(prev => prev - 1)
        setConfirmDelete(false)
        setIsEditModalOpen(false)
      }
    } catch (error) {
      console.error('Error deleting product:', error)
      const hint = error.response?.data?.hint
      const msg = error.response?.data?.error
      showToast('error', hint || msg || 'No se pudo eliminar el producto')
      setConfirmDelete(false)
    } finally {
      setDeletingProduct(false)
    }
  }

  const closeEditModal = () => {
    setConfirmDelete(false)
    setIsEditModalOpen(false)
  }

  return {
    subcategorias,
    subcategoriaFiltro,
    setSubcategoriaFiltro,
    crearSubcategoria,
    renombrarSubcategoria,
    desactivarSubcategoria,
    asignarSubcategoria,
    reordenarSubcategorias,
    renombrarCategoria,
    reordenarCategorias,
    productos,
    totalProductos,
    loading,
    syncing,
    searchQuery,
    setSearchQuery,
    missingImageOnly,
    proveedorFiltro,
    setProveedorFiltro,
    proveedoresCatalogo,
    setMissingImageOnly,
    currentPage,
    setCurrentPage,
    totalPages,
    handleSyncCatalog,

    isImageModalOpen,
    setIsImageModalOpen,
    isBrandModalOpen,
    setIsBrandModalOpen,
    isEditModalOpen,

    selectedProduct,

    imageSuggestions,
    loadingSuggestions,
    customSearchQuery,
    setCustomSearchQuery,
    assigningImage,
    openImageSuggestions,
    fetchImageSuggestions,
    handleAssignImage,
    handleSubirArchivoImagen,

    newProductName,
    brandRef,
    setBrandRef,
    brandPrice,
    setBrandPrice,
    brandCost,
    setBrandCost,
    brandImageUrl,
    setBrandImageUrl,
    brandSuggestions,
    loadingBrandSuggestions,
    creatingDuplicate,
    openBrandDuplication,
    handleBrandSearchSuggestions,
    handleNewProductNameChange,
    handleDuplicateBrand,

    editName,
    setEditName,
    editRef,
    setEditRef,
    editPrice,
    setEditPrice,
    editCost,
    setEditCost,
    editCategoria,
    setEditCategoria,
    categorias,
    savingEdit,
    openEditProduct,
    handleSaveEdit,
    closeEditModal,

    confirmDelete,
    deletingProduct,
    handleDeleteProduct,

    toast,
    setToast
  }
}
