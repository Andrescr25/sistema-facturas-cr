import { useState, useEffect } from 'react'
import api from '../services/api'
import { generarReferenciaMarca } from '../utils/gestionCatalogoUtils'

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
  const [brandName, setBrandName] = useState('')
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

  // Load products
  const fetchProducts = async () => {
    setLoading(true)
    try {
      const response = await api.get('/alegra/catalog/productos', {
        params: {
          search: searchQuery,
          missingImageOnly: missingImageOnly.toString(),
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
  }, [searchQuery, missingImageOnly])

  useEffect(() => {
    fetchProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchQuery, missingImageOnly])

  // Synchronize Cache with Alegra API
  const handleSyncCatalog = async () => {
    setSyncing(true)
    showToast('info', 'Sincronizando inventario con Alegra... Por favor espere.')
    try {
      const response = await api.post('/alegra/sincronizar/cache-productos', {}, { timeout: 180000 })
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
        setImageSuggestions(response.data.images)
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

  const handleAssignImage = async (imageUrl) => {
    setAssigningImage(true)
    try {
      const response = await api.post('/alegra/catalog/upload-image-url', {
        alegraId: selectedProduct.alegraId,
        imageUrl: imageUrl
      })

      if (response.data?.success) {
        showToast('success', 'Imagen asignada correctamente')
        // Update product in local state
        setProductos(prev => prev.map(p => {
          if (p.alegraId === selectedProduct.alegraId) {
            return { ...p, imageUrl: imageUrl }
          }
          return p
        }))
        setIsImageModalOpen(false)
      }
    } catch (error) {
      console.error('Error assigning image:', error)
      showToast('error', 'Error al asociar la imagen al producto en Alegra')
    } finally {
      setAssigningImage(false)
    }
  }

  // --- BRAND DUPLICATION ACTION ---
  const openBrandDuplication = (product) => {
    setSelectedProduct(product)
    setBrandName('')
    setBrandRef(`${product.reference || 'REF'}-`)
    setBrandPrice(product.price || 0)
    setBrandCost(product.cost || 0)
    setBrandImageUrl('')
    setBrandSuggestions([])
    setIsBrandModalOpen(true)
  }

  // Fetch brand image suggestions dynamically based on product name + brand
  const handleBrandSearchSuggestions = async () => {
    if (!brandName.trim()) {
      showToast('info', 'Escribe el nombre de la marca primero para buscar sugerencias.')
      return
    }
    setLoadingBrandSuggestions(true)
    setBrandSuggestions([])
    const searchQueryStr = `${selectedProduct.name} ${brandName.trim()}`
    try {
      const response = await api.get('/alegra/catalog/search-images', {
        params: { q: searchQueryStr }
      })
      if (response.data?.success) {
        setBrandSuggestions(response.data.images)
      }
    } catch (error) {
      console.error('Error searching brand images:', error)
      showToast('error', 'No se pudieron buscar sugerencias para la marca')
    } finally {
      setLoadingBrandSuggestions(false)
    }
  }

  // Update proposed reference automatically when typing brand
  const handleBrandNameChange = (e) => {
    const val = e.target.value
    setBrandName(val)
    setBrandRef(generarReferenciaMarca(val, selectedProduct.reference))
  }

  const handleDuplicateBrand = async (e) => {
    e.preventDefault()
    if (!brandName.trim()) {
      showToast('error', 'El nombre de la marca es obligatorio')
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
        brandName: brandName.trim(),
        newCode: brandRef.trim(),
        newPrice: brandPrice,
        newCost: brandCost,
        imageUrl: brandImageUrl
      })

      if (response.data?.success) {
        showToast('success', `Producto duplicado para la marca ${brandName} creado exitosamente.`)
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
  const openEditProduct = (product) => {
    setSelectedProduct(product)
    setEditName(product.name)
    setEditRef(product.reference || '')
    setEditPrice(product.price || 0)
    setEditCost(product.cost || 0)
    setIsEditModalOpen(true)
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
        cost: editCost
      })

      if (response.data?.success) {
        showToast('success', 'Producto actualizado correctamente')
        // Update product list state locally
        setProductos(prev => prev.map(p => {
          if (p.alegraId === selectedProduct.alegraId) {
            return {
              ...p,
              name: editName.trim(),
              reference: editRef.trim(),
              price: parseFloat(editPrice),
              cost: parseFloat(editCost)
            }
          }
          return p
        }))
        setIsEditModalOpen(false)
      }
    } catch (error) {
      console.error('Error saving edits:', error)
      showToast('error', 'Error al guardar los cambios en el servidor')
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
    productos,
    totalProductos,
    loading,
    syncing,
    searchQuery,
    setSearchQuery,
    missingImageOnly,
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

    brandName,
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
    handleBrandNameChange,
    handleDuplicateBrand,

    editName,
    setEditName,
    editRef,
    setEditRef,
    editPrice,
    setEditPrice,
    editCost,
    setEditCost,
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
