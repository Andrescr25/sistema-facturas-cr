import { Image as ImageIcon, RefreshCw, ExternalLink, Link as LinkIcon } from 'lucide-react'
import { useGestionCatalogo } from '../hooks/useGestionCatalogo'
import Toast from '../components/Toast'
import FiltrosCatalogo from '../components/gestion-catalogo/FiltrosCatalogo'
import GridProductos from '../components/gestion-catalogo/GridProductos'
import ModalSugerirImagen from '../components/ModalSugerirImagen'
import ModalDuplicarMarca from '../components/gestion-catalogo/ModalDuplicarMarca'
import ModalEditarProducto from '../components/gestion-catalogo/ModalEditarProducto'

export default function GestionCatalogo() {
  const {
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
  } = useGestionCatalogo()

  const catalogoPublicoUrl = `${window.location.origin}/catalogo-publico`

  const handleCopiarLinkCatalogo = async () => {
    try {
      await navigator.clipboard.writeText(catalogoPublicoUrl)
      setToast({ type: 'success', message: 'Link del catálogo copiado.' })
    } catch (error) {
      setToast({ type: 'error', message: 'No se pudo copiar el link.' })
    }
  }

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
          <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
            <span className="text-blue-100">Ver catálogo:</span>
            <a
              href="/catalogo-publico"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-white underline underline-offset-2 hover:text-blue-100"
            >
              {catalogoPublicoUrl}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={handleCopiarLinkCatalogo}
              className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded-md transition-colors"
              title="Copiar link para compartir"
            >
              <LinkIcon className="h-3.5 w-3.5" /> Copiar link
            </button>
          </div>
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

      <FiltrosCatalogo
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        missingImageOnly={missingImageOnly}
        setMissingImageOnly={setMissingImageOnly}
        totalProductos={totalProductos}
      />

      <GridProductos
        productos={productos}
        loading={loading}
        currentPage={currentPage}
        totalPages={totalPages}
        setCurrentPage={setCurrentPage}
        onSugerirFoto={openImageSuggestions}
        onAgregarMarca={openBrandDuplication}
        onEditar={openEditProduct}
      />

      {isImageModalOpen && selectedProduct && (
        <ModalSugerirImagen
          producto={selectedProduct}
          customSearchQuery={customSearchQuery}
          setCustomSearchQuery={setCustomSearchQuery}
          imageSuggestions={imageSuggestions}
          loadingSuggestions={loadingSuggestions}
          assigningImage={assigningImage}
          onBuscar={fetchImageSuggestions}
          onAsignar={handleAssignImage}
          onSubirArchivo={handleSubirArchivoImagen}
          onCerrar={() => setIsImageModalOpen(false)}
        />
      )}

      {isBrandModalOpen && selectedProduct && (
        <ModalDuplicarMarca
          producto={selectedProduct}
          newProductName={newProductName}
          brandRef={brandRef}
          setBrandRef={setBrandRef}
          brandPrice={brandPrice}
          setBrandPrice={setBrandPrice}
          brandCost={brandCost}
          setBrandCost={setBrandCost}
          brandImageUrl={brandImageUrl}
          setBrandImageUrl={setBrandImageUrl}
          brandSuggestions={brandSuggestions}
          loadingBrandSuggestions={loadingBrandSuggestions}
          creatingDuplicate={creatingDuplicate}
          onNewProductNameChange={handleNewProductNameChange}
          onBuscarSugerencias={handleBrandSearchSuggestions}
          onSubmit={handleDuplicateBrand}
          onCerrar={() => setIsBrandModalOpen(false)}
        />
      )}

      {isEditModalOpen && selectedProduct && (
        <ModalEditarProducto
          editName={editName}
          setEditName={setEditName}
          editRef={editRef}
          setEditRef={setEditRef}
          editPrice={editPrice}
          setEditPrice={setEditPrice}
          editCost={editCost}
          setEditCost={setEditCost}
          editCategoria={editCategoria}
          setEditCategoria={setEditCategoria}
          categorias={categorias}
          savingEdit={savingEdit}
          confirmDelete={confirmDelete}
          deletingProduct={deletingProduct}
          onSubmit={handleSaveEdit}
          onEliminar={handleDeleteProduct}
          onCerrar={closeEditModal}
        />
      )}
    </div>
  )
}
