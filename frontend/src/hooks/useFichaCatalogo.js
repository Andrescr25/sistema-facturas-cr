import { useState } from 'react'
import api from '../services/api'
import { conMiniaturasProxeadas } from '../utils/imagenSugeridaUtils'

/**
 * La ficha de un producto: sugerir/subir foto, duplicar por marca, editar y
 * eliminar. Extraído de useGestionCatalogo.js (la lógica no cambió; lo que
 * cambió es DÓNDE se refleja: contra `patchProducto`/`quitarProductos` de
 * useListaCatalogo en vez de un `setProductos` propio de una página
 * paginada) — sigue siendo la misma pantalla de datos+proveedores
 * (ModalProducto.jsx) que ya sabe pedir /productos-revision/.../relaciones.
 */
export function useFichaCatalogo({ arbol, patchProducto, quitarProductos, recargarLista, recargarArbol, categoriaActiva, mostrarToast }) {
  const [isImageModalOpen, setIsImageModalOpen] = useState(false)
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)

  const [imageSuggestions, setImageSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [customSearchQuery, setCustomSearchQuery] = useState('')
  const [assigningImage, setAssigningImage] = useState(false)

  const [newProductName, setNewProductName] = useState('')
  const [brandRef, setBrandRef] = useState('')
  const [brandPrice, setBrandPrice] = useState(0)
  const [brandCost, setBrandCost] = useState(0)
  const [brandImageUrl, setBrandImageUrl] = useState('')
  const [brandSuggestions, setBrandSuggestions] = useState([])
  const [loadingBrandSuggestions, setLoadingBrandSuggestions] = useState(false)
  const [creatingDuplicate, setCreatingDuplicate] = useState(false)

  const [editName, setEditName] = useState('')
  const [editRef, setEditRef] = useState('')
  const [editPrice, setEditPrice] = useState(0)
  const [editCost, setEditCost] = useState(0)
  const [editCategoria, setEditCategoria] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState(false)

  const categorias = arbol.map((c) => ({ id: c.id, name: c.name, nombreVisible: c.nombreVisible }))
  // ModalProducto filtra por `s.categoria === categoriaDelProducto`: necesita
  // la lista PLANA, no la anidada por categoría que trae el riel.
  const subcategoriasPlanas = arbol.flatMap((c) => c.subcategorias.map((s) => ({ ...s, categoria: c.name })))

  // --- imagen ---

  const fetchImageSuggestions = async (query) => {
    setLoadingSuggestions(true)
    setImageSuggestions([])
    try {
      const response = await api.get('/alegra/catalog/search-images', { params: { q: query } })
      if (response.data?.success) setImageSuggestions(conMiniaturasProxeadas(response.data.images))
    } catch (error) {
      console.error('Error searching images:', error)
      mostrarToast('error', 'No se pudieron buscar sugerencias de imágenes')
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
        mostrarToast('success', 'Imagen asignada correctamente')
        patchProducto(selectedProduct.alegraId, { imageUrl: finalImageUrl })
        setIsImageModalOpen(false)
      }
    } catch (error) {
      console.error('Error assigning image:', error)
      mostrarToast('error', error.response?.data?.message || 'Error al asociar la imagen al producto en Alegra')
    } finally {
      setAssigningImage(false)
    }
  }

  const handleSubirArchivoImagen = async (file) => {
    if (file.size > 2 * 1024 * 1024) { mostrarToast('error', 'La imagen debe ser menor a 2MB'); return }
    if (!file.type.startsWith('image/')) { mostrarToast('error', 'Solo se permiten archivos de imagen'); return }

    setAssigningImage(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const response = await api.post(`/alegra/catalog/upload-image-file/${selectedProduct.alegraId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      if (response.data?.success) {
        mostrarToast('success', 'Imagen asignada correctamente')
        patchProducto(selectedProduct.alegraId, { imageUrl: response.data.imageUrl })
        setIsImageModalOpen(false)
      }
    } catch (error) {
      console.error('Error uploading image file:', error)
      mostrarToast('error', error.response?.data?.message || 'Error al subir la imagen al producto en Alegra')
    } finally {
      setAssigningImage(false)
    }
  }

  // --- duplicar por marca ---

  const openBrandDuplication = async (product) => {
    setSelectedProduct(product)
    setNewProductName(product.name)
    setBrandRef(`${product.reference || 'REF'}-`)
    try {
      const { data } = await api.get('/alegra/catalog/siguiente-referencia', { params: { base: product.reference || 'REF' } })
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

  const handleBrandSearchSuggestions = async () => {
    if (!newProductName.trim()) { mostrarToast('info', 'Escribe el nombre del producto primero para buscar sugerencias.'); return }
    setLoadingBrandSuggestions(true)
    setBrandSuggestions([])
    try {
      const response = await api.get('/alegra/catalog/search-images', { params: { q: newProductName.trim() } })
      if (response.data?.success) setBrandSuggestions(conMiniaturasProxeadas(response.data.images))
    } catch (error) {
      console.error('Error searching brand images:', error)
      mostrarToast('error', 'No se pudieron buscar sugerencias de imagen')
    } finally {
      setLoadingBrandSuggestions(false)
    }
  }

  const handleNewProductNameChange = (e) => setNewProductName(e.target.value)

  const handleDuplicateBrand = async (e) => {
    e.preventDefault()
    if (!newProductName.trim()) { mostrarToast('error', 'El nombre del producto es obligatorio'); return }
    if (!brandRef.trim()) { mostrarToast('error', 'La referencia/código es obligatoria'); return }

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
        mostrarToast('success', `"${newProductName.trim()}" creado exitosamente.`)
        setIsBrandModalOpen(false)
        recargarLista() // el duplicado nuevo entra a la categoría activa
        recargarArbol()
      }
    } catch (error) {
      console.error('Error duplicating brand product:', error)
      mostrarToast('error', error.response?.data?.message || 'Error del servidor al duplicar el producto')
    } finally {
      setCreatingDuplicate(false)
    }
  }

  // --- editar / eliminar ---

  const openEditProduct = (product) => {
    setSelectedProduct(product)
    setEditName(product.name)
    setEditRef(product.reference || '')
    setEditPrice(product.price || 0)
    setEditCost(product.cost || 0)
    const categoriaActual = categorias.find((cat) => cat.name === product.category)
    setEditCategoria(categoriaActual ? String(categoriaActual.id) : '')
    setConfirmDelete(false)
    setIsEditModalOpen(true)
  }

  const asignarSubcategoria = async (alegraId, subcategoriaId) => {
    await api.put(`/alegra/catalog/productos/${alegraId}/subcategoria`, { subcategoriaId })
    const id = subcategoriaId ? Number(subcategoriaId) : null
    const s = id ? arbol.flatMap((c) => c.subcategorias).find((x) => x.id === id) : null
    const puesta = s ? { id: s.id, nombre: s.nombre } : null
    patchProducto(alegraId, { subcategoria: puesta })
    setSelectedProduct((prev) => (prev?.alegraId === alegraId ? { ...prev, subcategoria: puesta } : prev))
    // Los conteos del riel (la subcategoría vieja y la nueva) cambiaron. Es
    // una acción deliberada desde la ficha, no un hot path de muchos clics
    // seguidos —eso ya se corrigió para subir/bajar—, así que un refresco
    // completo acá no reintroduce el problema de los ~3 s.
    recargarArbol()
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editName.trim()) { mostrarToast('error', 'El nombre es requerido'); return }
    if (!editRef.trim()) { mostrarToast('error', 'La referencia es requerida'); return }

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
        mostrarToast('success', 'Producto actualizado correctamente')
        const categoriaNueva = categorias.find((cat) => String(cat.id) === String(editCategoria))
        const cambioDeCategoria = categoriaNueva && categoriaNueva.name !== selectedProduct.category

        if (cambioDeCategoria && categoriaActiva && categoriaNueva.name !== categoriaActiva) {
          // Ya no pertenece a la categoría que se está mirando: sale de la
          // lista. (En los resultados de una búsqueda sí sigue apareciendo.)
          quitarProductos([selectedProduct.alegraId])
        } else {
          patchProducto(selectedProduct.alegraId, {
            name: editName.trim(),
            reference: editRef.trim(),
            price: parseFloat(editPrice),
            cost: parseFloat(editCost),
            category: categoriaNueva ? categoriaNueva.name : selectedProduct.category,
            // La categoría es DE la subcategoría: si cambió, el backend ya
            // limpió subcategoria_id — se refleja acá también.
            ...(cambioDeCategoria ? { subcategoria: null } : {})
          })
        }
        recargarArbol()
        setIsEditModalOpen(false)
      }
    } catch (error) {
      console.error('Error saving edits:', error)
      mostrarToast('error', error.response?.data?.message || 'Error al guardar los cambios en el servidor')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteProduct = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeletingProduct(true)
    try {
      const response = await api.delete(`/alegra/catalog/productos/${selectedProduct.alegraId}`)
      if (response.data?.success) {
        const message = response.data.hidden
          ? `"${selectedProduct.name}" tiene facturas asociadas en Alegra y no se puede eliminar, se ocultó del catálogo`
          : `Producto "${selectedProduct.name}" eliminado correctamente`
        mostrarToast(response.data.hidden ? 'info' : 'success', message)
        quitarProductos([selectedProduct.alegraId])
        recargarArbol()
        setConfirmDelete(false)
        setIsEditModalOpen(false)
      }
    } catch (error) {
      console.error('Error deleting product:', error)
      const hint = error.response?.data?.hint
      const msg = error.response?.data?.error
      mostrarToast('error', hint || msg || 'No se pudo eliminar el producto')
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
    categorias,
    subcategoriasPlanas,
    isImageModalOpen, setIsImageModalOpen,
    isBrandModalOpen, setIsBrandModalOpen,
    isEditModalOpen,
    selectedProduct,
    imageSuggestions, loadingSuggestions, customSearchQuery, setCustomSearchQuery, assigningImage,
    openImageSuggestions, fetchImageSuggestions, handleAssignImage, handleSubirArchivoImagen,
    newProductName, brandRef, setBrandRef, brandPrice, setBrandPrice, brandCost, setBrandCost,
    brandImageUrl, setBrandImageUrl, brandSuggestions, loadingBrandSuggestions, creatingDuplicate,
    openBrandDuplication, handleBrandSearchSuggestions, handleNewProductNameChange, handleDuplicateBrand,
    editName, setEditName, editRef, setEditRef, editPrice, setEditPrice, editCost, setEditCost,
    editCategoria, setEditCategoria, savingEdit, openEditProduct, handleSaveEdit, closeEditModal,
    confirmDelete, deletingProduct, handleDeleteProduct,
    asignarSubcategoria
  }
}
