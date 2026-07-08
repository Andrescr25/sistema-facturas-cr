import { useState, useEffect } from 'react';
import { 
  Search, 
  Image as ImageIcon, 
  Plus, 
  Edit, 
  RefreshCw, 
  AlertCircle, 
  X, 
  Check, 
  DollarSign, 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  Loader2 
} from 'lucide-react';
import api from '../services/api';
import Toast from '../components/Toast';

export default function GestionCatalogo() {
  // State variables
  const [productos, setProductos] = useState([]);
  const [totalProductos, setTotalProductos] = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [missingImageOnly, setMissingImageOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 24; // Grilla de 4x6

  // Modal States
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Selected product state
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // Image Suggestion States
  const [imageSuggestions, setImageSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [assigningImage, setAssigningImage] = useState(false);

  // Duplication Modal States
  const [brandName, setBrandName] = useState('');
  const [brandRef, setBrandRef] = useState('');
  const [brandPrice, setBrandPrice] = useState(0);
  const [brandCost, setBrandCost] = useState(0);
  const [brandImageUrl, setBrandImageUrl] = useState('');
  const [brandSuggestions, setBrandSuggestions] = useState([]);
  const [loadingBrandSuggestions, setLoadingBrandSuggestions] = useState(false);
  const [creatingDuplicate, setCreatingDuplicate] = useState(false);

  // Edit Modal States
  const [editName, setEditName] = useState('');
  const [editRef, setEditRef] = useState('');
  const [editPrice, setEditPrice] = useState(0);
  const [editCost, setEditCost] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);

  // Toast / Messages state
  const [toast, setToast] = useState(null);

  // Load products
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await api.get('/alegra/catalog/productos', {
        params: {
          search: searchQuery,
          missingImageOnly: missingImageOnly.toString(),
          page: currentPage.toString(),
          limit: limit.toString()
        }
      });
      if (response.data?.success) {
        setProductos(response.data.data);
        setTotalProductos(response.data.pagination.total);
        setTotalPages(response.data.pagination.pages);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      showToast('error', 'Error al cargar los productos de la base de datos');
    } finally {
      setLoading(false);
    }
  };

  // Debounced search trigger or trigger on dependencies change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, missingImageOnly]);

  useEffect(() => {
    fetchProducts();
  }, [currentPage, searchQuery, missingImageOnly]);

  // Synchronize Cache with Alegra API
  const handleSyncCatalog = async () => {
    setSyncing(true);
    showToast('info', 'Sincronizando inventario con Alegra... Por favor espere.');
    try {
      const response = await api.post('/alegra/sincronizar/cache-productos', {}, { timeout: 180000 });
      if (response.data?.success) {
        showToast('success', `Sincronización finalizada. ${response.data.count} productos cargados.`);
        fetchProducts();
      } else {
        showToast('error', 'La sincronización de productos falló');
      }
    } catch (error) {
      console.error('Sync catalog error:', error);
      showToast('error', 'Error del servidor durante la sincronización');
    } finally {
      setSyncing(false);
    }
  };

  // Toast helper
  const showToast = (type, message) => {
    setToast({ type, message });
  };

  // Format colon currency
  const formatCRC = (value) => {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: 'CRC',
      minimumFractionDigits: 2
    }).format(value);
  };

  // --- IMAGE SUGGESTIONS ACTION ---
  const openImageSuggestions = async (product) => {
    setSelectedProduct(product);
    setCustomSearchQuery(product.name);
    setIsImageModalOpen(true);
    fetchImageSuggestions(product.name);
  };

  const fetchImageSuggestions = async (query) => {
    setLoadingSuggestions(true);
    setImageSuggestions([]);
    try {
      const response = await api.get('/alegra/catalog/search-images', {
        params: { q: query }
      });
      if (response.data?.success) {
        setImageSuggestions(response.data.images);
      }
    } catch (error) {
      console.error('Error searching images:', error);
      showToast('error', 'No se pudieron buscar sugerencias de imágenes');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleAssignImage = async (imageUrl) => {
    setAssigningImage(true);
    try {
      const response = await api.post('/alegra/catalog/upload-image-url', {
        alegraId: selectedProduct.alegraId,
        imageUrl: imageUrl
      });
      
      if (response.data?.success) {
        showToast('success', 'Imagen asignada correctamente');
        // Update product in local state
        setProductos(prev => prev.map(p => {
          if (p.alegraId === selectedProduct.alegraId) {
            return { ...p, imageUrl: imageUrl };
          }
          return p;
        }));
        setIsImageModalOpen(false);
      }
    } catch (error) {
      console.error('Error assigning image:', error);
      showToast('error', 'Error al asociar la imagen al producto en Alegra');
    } finally {
      setAssigningImage(false);
    }
  };

  // --- BRAND DUPLICATION ACTION ---
  const openBrandDuplication = (product) => {
    setSelectedProduct(product);
    setBrandName('');
    setBrandRef(`${product.reference || 'REF'}-`);
    setBrandPrice(product.price || 0);
    setBrandCost(product.cost || 0);
    setBrandImageUrl('');
    setBrandSuggestions([]);
    setIsBrandModalOpen(true);
  };

  // Fetch brand image suggestions dynamically based on product name + brand
  const handleBrandSearchSuggestions = async () => {
    if (!brandName.trim()) {
      showToast('info', 'Escribe el nombre de la marca primero para buscar sugerencias.');
      return;
    }
    setLoadingBrandSuggestions(true);
    setBrandSuggestions([]);
    const searchQueryStr = `${selectedProduct.name} ${brandName.trim()}`;
    try {
      const response = await api.get('/alegra/catalog/search-images', {
        params: { q: searchQueryStr }
      });
      if (response.data?.success) {
        setBrandSuggestions(response.data.images);
      }
    } catch (error) {
      console.error('Error searching brand images:', error);
      showToast('error', 'No se pudieron buscar sugerencias para la marca');
    } finally {
      setLoadingBrandSuggestions(false);
    }
  };

  // Update proposed reference automatically when typing brand
  const handleBrandNameChange = (e) => {
    const val = e.target.value;
    setBrandName(val);
    
    // Clean spaces and special chars, convert to uppercase for reference code
    const cleanBrand = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const cleanRef = (selectedProduct.reference || 'REF').replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
    
    if (cleanBrand) {
      setBrandRef(`${cleanRef}-${cleanBrand}`);
    } else {
      setBrandRef(`${cleanRef}-`);
    }
  };

  const handleDuplicateBrand = async (e) => {
    e.preventDefault();
    if (!brandName.trim()) {
      showToast('error', 'El nombre de la marca es obligatorio');
      return;
    }
    if (!brandRef.trim()) {
      showToast('error', 'La referencia/código es obligatoria');
      return;
    }

    setCreatingDuplicate(true);
    try {
      const response = await api.post('/api/alegra/catalog/duplicate-brand', {
        originalProductId: selectedProduct.alegraId,
        brandName: brandName.trim(),
        newCode: brandRef.trim(),
        newPrice: brandPrice,
        newCost: brandCost,
        imageUrl: brandImageUrl
      });

      if (response.data?.success) {
        showToast('success', `Producto duplicado para la marca ${brandName} creado exitosamente.`);
        setIsBrandModalOpen(false);
        fetchProducts(); // Refresh list to show newly created item
      }
    } catch (error) {
      console.error('Error duplicating brand product:', error);
      showToast('error', error.response?.data?.message || 'Error del servidor al duplicar el producto');
    } finally {
      setCreatingDuplicate(false);
    }
  };

  // --- EDIT PRODUCT ACTION ---
  const openEditProduct = (product) => {
    setSelectedProduct(product);
    setEditName(product.name);
    setEditRef(product.reference || '');
    setEditPrice(product.price || 0);
    setEditCost(product.cost || 0);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editName.trim()) {
      showToast('error', 'El nombre es requerido');
      return;
    }
    if (!editRef.trim()) {
      showToast('error', 'La referencia es requerida');
      return;
    }

    setSavingEdit(true);
    try {
      const response = await api.put(`/alegra/catalog/productos/${selectedProduct.alegraId}`, {
        name: editName.trim(),
        reference: editRef.trim(),
        price: editPrice,
        cost: editCost
      });

      if (response.data?.success) {
        showToast('success', 'Producto actualizado correctamente');
        // Update product list state locally
        setProductos(prev => prev.map(p => {
          if (p.alegraId === selectedProduct.alegraId) {
            return {
              ...p,
              name: editName.trim(),
              reference: editRef.trim(),
              price: parseFloat(editPrice),
              cost: parseFloat(editCost)
            };
          }
          return p;
        }));
        setIsEditModalOpen(false);
      }
    } catch (error) {
      console.error('Error saving edits:', error);
      showToast('error', 'Error al guardar los cambios en el servidor');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <Toast 
          type={toast.type} 
          message={toast.message} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Header Card */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl shadow-lg p-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
            <ImageIcon className="h-7 w-7" /> Gestión de Catálogo
          </h1>
          <p className="text-blue-100 mt-1">
            Administra imágenes de productos, duplica ítems por marcas y sincroniza tu inventario de Alegra.
          </p>
        </div>
        
        <button
          onClick={handleSyncCatalog}
          disabled={syncing || loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-blue-600 font-semibold rounded-lg shadow-md hover:bg-blue-50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando...' : 'Sincronizar con Alegra'}
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl shadow-md p-4 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 border border-gray-100">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <Search className="h-5 w-5" />
          </span>
          <input
            type="text"
            placeholder="Buscar por nombre, código de referencia o descripción..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
          />
        </div>

        <div className="flex items-center justify-between lg:justify-end gap-6">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={missingImageOnly}
              onChange={(e) => setMissingImageOnly(e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Mostrar sólo sin imagen
            </span>
          </label>

          <div className="text-xs text-gray-400 font-medium">
            Total en base local: <span className="font-bold text-gray-700 text-sm">{totalProductos}</span>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="min-h-[400px] flex flex-col justify-center items-center gap-3 bg-white rounded-xl shadow-md border border-gray-100">
          <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
          <span className="text-gray-500 font-medium">Cargando catálogo...</span>
        </div>
      ) : productos.length === 0 ? (
        <div className="min-h-[300px] flex flex-col justify-center items-center bg-white rounded-xl shadow-md border border-gray-100 p-8 text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mb-3" />
          <h3 className="text-lg font-bold text-gray-800">No se encontraron productos</h3>
          <p className="text-gray-500 mt-1 max-w-md">
            No encontramos ningún producto activo que coincida con tus criterios de búsqueda. Intenta limpiando los filtros o sincronizando con Alegra.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {productos.map((prod) => {
            const hasImg = !!prod.imageUrl;
            return (
              <div 
                key={prod.id} 
                className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col"
              >
                {/* Product Image Panel */}
                <div className={`relative h-36 bg-gray-50 flex items-center justify-center overflow-hidden border-b border-gray-100 ${!hasImg ? 'border-dashed border-red-200' : ''}`}>
                  {hasImg ? (
                    <img 
                      src={prod.imageUrl} 
                      alt={prod.name}
                      className="object-contain h-full w-full group-hover:scale-105 transition-transform duration-300 p-2"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-4">
                      <ImageIcon className="h-8 w-8 text-red-300 animate-pulse mb-1" />
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                        Sin Imagen
                      </span>
                    </div>
                  )}

                  {/* Reference Badge */}
                  <span className="absolute top-2 left-2 px-2 py-0.5 bg-gray-900/80 backdrop-blur-sm text-white text-[10px] font-bold rounded-md uppercase tracking-wider max-w-[80%] truncate">
                    {prod.reference || 'Sin Ref'}
                  </span>
                </div>

                {/* Info Panel */}
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-blue-600 truncate">
                      {prod.category || 'General'}
                    </div>
                    <h3 className="text-xs font-bold text-gray-800 line-clamp-2 h-8 leading-tight group-hover:text-blue-600 transition-colors" title={prod.name}>
                      {prod.name}
                    </h3>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-gray-50 flex flex-col gap-0.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-gray-400 font-medium">Precio:</span>
                      <span className="font-bold text-gray-900">{formatCRC(prod.price)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-gray-400 font-medium">Costo:</span>
                      <span className="font-medium text-gray-500">{formatCRC(prod.cost)}</span>
                    </div>
                  </div>
                </div>

                {/* Hover overlay with action buttons */}
                <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 flex flex-col justify-center items-stretch gap-2 p-4 transition-all duration-300 z-10">
                  <button
                    onClick={() => openImageSuggestions(prod)}
                    className="flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-[11px] font-bold rounded-lg transition-all"
                  >
                    <ImageIcon className="h-3.5 w-3.5" /> Sugerir Foto
                  </button>
                  <button
                    onClick={() => openBrandDuplication(prod)}
                    className="flex items-center justify-center gap-1.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-[11px] font-bold rounded-lg transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar Marcas
                  </button>
                  <button
                    onClick={() => openEditProduct(prod)}
                    className="flex items-center justify-center gap-1.5 py-1.5 bg-white hover:bg-gray-100 active:scale-95 text-gray-800 text-[11px] font-bold rounded-lg transition-all"
                  >
                    <Edit className="h-3.5 w-3.5 text-gray-500" /> Editar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination component */}
      {!loading && totalPages > 1 && (
        <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 flex justify-between items-center">
          <span className="text-xs text-gray-500 font-medium">
            Página <span className="font-bold text-gray-700">{currentPage}</span> de <span className="font-bold text-gray-700">{totalPages}</span>
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL 1: SUGERIR IMAGEN --- */}
      {isImageModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50">
              <div>
                <span className="text-[10px] uppercase font-extrabold tracking-wider bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">
                  Sugerencias Automáticas
                </span>
                <h3 className="text-base font-bold text-gray-900 mt-1 line-clamp-1">
                  Sugerir imagen para: {selectedProduct.name}
                </h3>
              </div>
              <button 
                onClick={() => setIsImageModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Custom search bar */}
            <div className="p-4 border-b border-gray-100 flex gap-2">
              <input
                type="text"
                value={customSearchQuery}
                onChange={(e) => setCustomSearchQuery(e.target.value)}
                placeholder="Editar término de búsqueda..."
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => fetchImageSuggestions(customSearchQuery)}
                disabled={loadingSuggestions}
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg text-sm hover:bg-blue-700 transition-colors flex items-center gap-1.5"
              >
                {loadingSuggestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </button>
            </div>

            {/* Modal Body / Images Grid */}
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
              {loadingSuggestions ? (
                <div className="h-48 flex flex-col justify-center items-center gap-2">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                  <span className="text-sm text-gray-500 font-medium">Buscando imágenes sugeridas...</span>
                </div>
              ) : imageSuggestions.length === 0 ? (
                <div className="h-48 flex flex-col justify-center items-center text-center p-4">
                  <AlertCircle className="h-10 w-10 text-gray-400 mb-2" />
                  <span className="text-sm font-semibold text-gray-600">No encontramos sugerencias</span>
                  <span className="text-xs text-gray-400 mt-1 max-w-sm">
                    Prueba modificando la barra de búsqueda superior con un nombre de producto más simple.
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {imageSuggestions.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => handleAssignImage(img.url)}
                      disabled={assigningImage}
                      className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden p-2 hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 hover:shadow-md transition-all flex flex-col items-center justify-center aspect-square"
                    >
                      <img
                        src={img.thumbnail}
                        alt="Suggestion"
                        className="object-contain h-full w-full max-h-[120px] p-1"
                        loading="lazy"
                        onError={(e) => { e.target.src = 'https://placehold.co/150?text=Error+Carga'; }}
                      />
                      
                      {/* Hover status select */}
                      <div className="absolute inset-0 bg-blue-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                        {assigningImage ? (
                          <Loader2 className="h-7 w-7 text-white animate-spin" />
                        ) : (
                          <Check className="h-7 w-7 text-white" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setIsImageModalOpen(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 font-semibold hover:bg-gray-100 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: DUPLICAR PRODUCTO POR MARCAS --- */}
      {isBrandModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50">
              <div>
                <span className="text-[10px] uppercase font-extrabold tracking-wider bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full">
                  Duplicar para Marcas
                </span>
                <h3 className="text-base font-bold text-gray-900 mt-1 line-clamp-1">
                  Duplicar producto: {selectedProduct.name}
                </h3>
              </div>
              <button 
                onClick={() => setIsBrandModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form & Image Picker Container */}
            <form onSubmit={handleDuplicateBrand} className="flex-1 overflow-y-auto flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100">
              
              {/* Left Column: Form Details */}
              <div className="w-full md:w-1/2 p-6 space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wide text-gray-400">Detalles de la nueva marca</h4>
                
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600">Nombre del Producto Base:</label>
                  <input
                    type="text"
                    disabled
                    value={selectedProduct.name}
                    className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-500 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700">Nombre de la Marca (ej: Pepsi, Link, etc.):</label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={handleBrandNameChange}
                    placeholder="Escribe la marca comercial..."
                    required
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Nuevo Nombre Generado:</label>
                    <input
                      type="text"
                      disabled
                      value={brandName.trim() ? `${selectedProduct.name} - ${brandName.trim()}` : selectedProduct.name}
                      className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-[11px] text-gray-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Nueva Referencia (Código):</label>
                    <input
                      type="text"
                      value={brandRef}
                      onChange={(e) => setBrandRef(e.target.value)}
                      required
                      placeholder="Código del producto..."
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Precio de Venta (₡):</label>
                    <input
                      type="number"
                      step="0.01"
                      value={brandPrice}
                      onChange={(e) => setBrandPrice(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Costo Unitario (₡):</label>
                    <input
                      type="number"
                      step="0.01"
                      value={brandCost}
                      onChange={(e) => setBrandCost(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>

                {brandImageUrl && (
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-3">
                    <img src={brandImageUrl} alt="Selected" className="h-12 w-12 object-contain bg-white rounded border border-indigo-200" />
                    <div>
                      <div className="text-[10px] uppercase font-bold text-indigo-600">Imagen Seleccionada</div>
                      <button 
                        type="button" 
                        onClick={() => setBrandImageUrl('')}
                        className="text-xs text-red-500 hover:text-red-700 font-medium underline mt-0.5"
                      >
                        Quitar imagen
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Dynamic Image Suggestions Grid */}
              <div className="w-full md:w-1/2 p-6 bg-gray-50 flex flex-col justify-between">
                <div className="space-y-4 flex-1">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-extrabold uppercase tracking-wide text-gray-400">Sugerir Imagen para la marca</h4>
                    <button
                      type="button"
                      onClick={handleBrandSearchSuggestions}
                      disabled={loadingBrandSuggestions || !brandName.trim()}
                      className="px-3 py-1 bg-white border border-gray-200 text-indigo-600 hover:bg-indigo-50 active:scale-95 text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1 disabled:opacity-50"
                    >
                      {loadingBrandSuggestions ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Buscar Fotos
                    </button>
                  </div>

                  {loadingBrandSuggestions ? (
                    <div className="h-44 flex flex-col justify-center items-center gap-1">
                      <Loader2 className="h-6 w-6 text-indigo-600 animate-spin" />
                      <span className="text-xs text-gray-400">Buscando imágenes sugeridas...</span>
                    </div>
                  ) : brandSuggestions.length === 0 ? (
                    <div className="h-44 flex flex-col justify-center items-center text-center p-4 border border-dashed border-gray-200 rounded-xl bg-white">
                      <ImageIcon className="h-8 w-8 text-gray-300 mb-1" />
                      <span className="text-xs font-medium text-gray-500">Sin sugerencias cargadas</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">
                        Completa el nombre de la marca y haz clic en "Buscar Fotos"
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-[220px] p-1">
                      {brandSuggestions.map((img, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setBrandImageUrl(img.url)}
                          className={`relative bg-white border rounded-lg p-1.5 flex items-center justify-center aspect-square focus:outline-none transition-all ${
                            brandImageUrl === img.url ? 'border-indigo-600 ring-2 ring-indigo-300 scale-95' : 'border-gray-200 hover:border-indigo-400'
                          }`}
                        >
                          <img 
                            src={img.thumbnail} 
                            alt="Brand suggestion" 
                            className="object-contain max-h-[50px]"
                            onError={(e) => { e.target.src = 'https://placehold.co/100?text=Error'; }}
                          />
                          {brandImageUrl === img.url && (
                            <div className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full p-0.5">
                              <Check className="h-2.5 w-2.5" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 mt-4">
                  <button
                    type="button"
                    onClick={() => setIsBrandModalOpen(false)}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 font-semibold hover:bg-gray-100 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creatingDuplicate}
                    className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-md disabled:opacity-50"
                  >
                    {creatingDuplicate ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Crear Duplicado
                      </>
                    )}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: EDITAR DETALLES DEL PRODUCTO --- */}
      {isEditModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                <Edit className="h-5 w-5 text-blue-500" /> Editar Producto
              </h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Nombre del Producto:</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  placeholder="Ej: Coca Cola Sabor Original 350ml"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Referencia (Código de Barras/Interno):</label>
                <input
                  type="text"
                  value={editRef}
                  onChange={(e) => setEditRef(e.target.value)}
                  required
                  placeholder="Ej: 744100123456"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700">Precio de Venta (₡):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700">Costo Unitario (₡):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 font-semibold hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg text-sm hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Guardar Cambios
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
