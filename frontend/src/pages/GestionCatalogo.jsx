import { useEffect, useState } from 'react'
import { Image as ImageIcon, RefreshCw, ExternalLink, Link as LinkIcon } from 'lucide-react'
import api from '../services/api'
import { useTaxonomiaCatalogo } from '../hooks/useTaxonomiaCatalogo'
import { useListaCatalogo } from '../hooks/useListaCatalogo'
import { useSeleccionLote } from '../hooks/useSeleccionLote'
import { useFichaCatalogo } from '../hooks/useFichaCatalogo'
import { useAccionesLote } from '../hooks/useAccionesLote'
import Toast from '../components/Toast'
import RielTaxonomia from '../components/gestion-catalogo/RielTaxonomia'
import BarraBusqueda from '../components/gestion-catalogo/BarraBusqueda'
import ListaProductos from '../components/gestion-catalogo/ListaProductos'
import BarraLote from '../components/gestion-catalogo/BarraLote'
import ModalSugerirImagen from '../components/ModalSugerirImagen'
import ModalDuplicarMarca from '../components/gestion-catalogo/ModalDuplicarMarca'
import ModalProducto from '../components/gestion-catalogo/ModalProducto'

/**
 * Gestión de Catálogo — rediseño total (2026-09-21).
 *
 * ANTES: una grilla plana de 2.000+ productos paginada de 24 en 24, con el
 * filtro de subcategoría roto y ninguna acción en lote. Clasificar un
 * producto costaba ~5 pasos, y no había forma de ver de un vistazo qué
 * faltaba.
 *
 * AHORA: un riel a la izquierda con la taxonomía completa EN EL MISMO ORDEN
 * QUE VE EL AGENTE (ver useTaxonomiaCatalogo y catalogoAgentePersonalizacion.js
 * — no hay una segunda implementación del orden), con "Sin clasificar"
 * siempre visible como punto de entrada. A la derecha, todos los productos de
 * lo seleccionado, agrupados igual, con selección múltiple y dos acciones en
 * lote (mover a subcategoría, instantáneo; cambiar de categoría, que escribe
 * en Alegra y corre en segundo plano).
 */
export default function GestionCatalogo() {
  const [toast, setToast] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const mostrarToast = (type, message) => setToast({ type, message })

  const taxonomia = useTaxonomiaCatalogo()
  const { arbol, loadingArbol, categoriaActiva, subFoco } = taxonomia

  const lista = useListaCatalogo({ arbol, categoriaActiva, subFoco })
  const seleccion = useSeleccionLote()

  // Cambiar de categoría, de foco o de búsqueda invalida cualquier selección
  // anterior: son productos que ya no se están mirando.
  useEffect(() => {
    seleccion.limpiar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaActiva, subFoco, lista.busquedaActiva])

  const ficha = useFichaCatalogo({
    arbol,
    patchProducto: lista.patchProducto,
    quitarProductos: lista.quitarProductos,
    recargarLista: lista.recargar,
    recargarArbol: taxonomia.recargarArbol,
    categoriaActiva,
    mostrarToast
  })

  const acciones = useAccionesLote({
    arbol,
    patchProducto: lista.patchProducto,
    quitarProductos: lista.quitarProductos,
    recargarArbol: taxonomia.recargarArbol,
    mostrarToast
  })

  const moverSeleccionADosubcategoria = async (subcategoriaId) => {
    const ids = [...seleccion.seleccionados]
    const ok = await acciones.moverASubcategoria(ids, subcategoriaId)
    if (ok) seleccion.limpiar()
  }

  const cambiarCategoriaDeSeleccion = async (categoriaId) => {
    const ids = [...seleccion.seleccionados]
    const ok = await acciones.cambiarCategoria(ids, categoriaId)
    if (ok) seleccion.limpiar()
  }

  const handleSyncCatalog = async () => {
    setSyncing(true)
    mostrarToast('info', 'Sincronizando inventario con Alegra... Por favor espere.')
    try {
      // En producción ya se vio tardar más de 3 minutos con 2000+ productos.
      const response = await api.post('/alegra/sincronizar/cache-productos', {}, { timeout: 10 * 60 * 1000 })
      if (response.data?.success) {
        mostrarToast('success', `Sincronización finalizada. ${response.data.count} productos cargados.`)
        taxonomia.recargarArbol()
        lista.recargar()
      } else {
        mostrarToast('error', 'La sincronización de productos falló')
      }
    } catch (error) {
      console.error('Sync catalog error:', error)
      mostrarToast('error', 'Error del servidor durante la sincronización')
    } finally {
      setSyncing(false)
    }
  }

  const catalogoAgenteUrl = `${window.location.origin}/catalogo-agente`
  const handleCopiarLinkCatalogo = async () => {
    try {
      await navigator.clipboard.writeText(catalogoAgenteUrl)
      mostrarToast('success', 'Link del catálogo copiado.')
    } catch {
      mostrarToast('error', 'No se pudo copiar el link.')
    }
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col gap-4">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="shrink-0 flex flex-col items-start justify-between gap-4 rounded-xl bg-gradient-to-r from-primario-600 to-primario-700 p-5 text-white shadow-lg md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-wide">
            <ImageIcon className="h-6 w-6" /> Gestión de Catálogo
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-primario-100">Ver catálogo:</span>
            <a href="/catalogo-agente" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-white underline underline-offset-2 hover:text-primario-100">
              {catalogoAgenteUrl} <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button onClick={handleCopiarLinkCatalogo} className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 transition-colors hover:bg-white/20">
              <LinkIcon className="h-3.5 w-3.5" /> Copiar link
            </button>
          </div>
        </div>

        <button
          onClick={handleSyncCatalog}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-semibold text-primario-600 shadow-md transition-all hover:bg-primario-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando...' : 'Sincronizar con Alegra'}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[18rem_1fr]">
        <div className="min-h-0 md:h-full">
          <RielTaxonomia
            arbol={arbol}
            loading={loadingArbol}
            categoriaActiva={categoriaActiva}
            subFoco={subFoco}
            onSeleccionarCategoria={taxonomia.seleccionarCategoria}
            onSeleccionarSub={taxonomia.seleccionarSubcategoria}
            onSeleccionarSinClasificar={taxonomia.seleccionarSinClasificar}
            onRenombrarCategoria={taxonomia.renombrarCategoria}
            onReordenarCategorias={taxonomia.reordenarCategorias}
            onCrearCategoria={taxonomia.crearCategoria}
            onCrearSub={taxonomia.crearSubcategoria}
            onRenombrarSub={taxonomia.renombrarSubcategoria}
            onReordenarSub={taxonomia.reordenarSubcategorias}
            onEliminarSub={(categoria, id) => taxonomia.eliminarSubcategoria(categoria, id).catch((e) => {
              mostrarToast('error', e?.response?.data?.message || 'No se pudo borrar la subcategoría.')
            })}
          />
        </div>

        <div className="flex min-h-0 flex-col overflow-y-auto pr-1">
          <BarraBusqueda
            busqueda={lista.busqueda}
            setBusqueda={lista.setBusqueda}
            soloSinImagen={lista.soloSinImagen}
            setSoloSinImagen={lista.setSoloSinImagen}
            total={lista.bloques ? lista.bloques.reduce((n, b) => n + b.productos.length, 0) : lista.productos.length}
          />

          <div className="mt-3 flex-1">
            <ListaProductos
              loading={lista.loading || (loadingArbol && !categoriaActiva)}
              sinSeleccion={!lista.busquedaActiva && !categoriaActiva && !loadingArbol}
              busquedaActiva={lista.busquedaActiva}
              bloques={lista.bloques}
              productos={lista.productos}
              alternar={seleccion.alternar}
              estaSeleccionado={seleccion.estaSeleccionado}
              seleccionarTodos={seleccion.seleccionarTodos}
              deseleccionarTodos={seleccion.deseleccionarTodos}
              onEditar={ficha.openEditProduct}
              onSugerirFoto={ficha.openImageSuggestions}
              onDuplicar={ficha.openBrandDuplication}
            />
          </div>

          <BarraLote
            cantidad={seleccion.cantidad}
            busquedaActiva={lista.busquedaActiva}
            categoriaActiva={categoriaActiva}
            arbol={arbol}
            moviendo={acciones.moviendo}
            trabajoCategoria={acciones.trabajoCategoria}
            onMoverASubcategoria={moverSeleccionADosubcategoria}
            onCambiarCategoria={cambiarCategoriaDeSeleccion}
            onCerrarTrabajo={acciones.cerrarTrabajoCategoria}
            onLimpiar={seleccion.limpiar}
          />
        </div>
      </div>

      {ficha.isImageModalOpen && ficha.selectedProduct && (
        <ModalSugerirImagen
          producto={ficha.selectedProduct}
          customSearchQuery={ficha.customSearchQuery}
          setCustomSearchQuery={ficha.setCustomSearchQuery}
          imageSuggestions={ficha.imageSuggestions}
          loadingSuggestions={ficha.loadingSuggestions}
          assigningImage={ficha.assigningImage}
          onBuscar={ficha.fetchImageSuggestions}
          onAsignar={ficha.handleAssignImage}
          onSubirArchivo={ficha.handleSubirArchivoImagen}
          onCerrar={() => ficha.setIsImageModalOpen(false)}
        />
      )}

      {ficha.isBrandModalOpen && ficha.selectedProduct && (
        <ModalDuplicarMarca
          producto={ficha.selectedProduct}
          newProductName={ficha.newProductName}
          brandRef={ficha.brandRef} setBrandRef={ficha.setBrandRef}
          brandPrice={ficha.brandPrice} setBrandPrice={ficha.setBrandPrice}
          brandCost={ficha.brandCost} setBrandCost={ficha.setBrandCost}
          brandImageUrl={ficha.brandImageUrl} setBrandImageUrl={ficha.setBrandImageUrl}
          brandSuggestions={ficha.brandSuggestions}
          loadingBrandSuggestions={ficha.loadingBrandSuggestions}
          creatingDuplicate={ficha.creatingDuplicate}
          onNewProductNameChange={ficha.handleNewProductNameChange}
          onBuscarSugerencias={ficha.handleBrandSearchSuggestions}
          onSubmit={ficha.handleDuplicateBrand}
          onCerrar={() => ficha.setIsBrandModalOpen(false)}
        />
      )}

      {ficha.isEditModalOpen && ficha.selectedProduct && (
        <ModalProducto
          editName={ficha.editName} setEditName={ficha.setEditName}
          editRef={ficha.editRef} setEditRef={ficha.setEditRef}
          editPrice={ficha.editPrice} setEditPrice={ficha.setEditPrice}
          editCost={ficha.editCost} setEditCost={ficha.setEditCost}
          editCategoria={ficha.editCategoria} setEditCategoria={ficha.setEditCategoria}
          categorias={ficha.categorias}
          producto={ficha.selectedProduct}
          subcategorias={ficha.subcategoriasPlanas}
          onCrearSubcategoria={taxonomia.crearSubcategoria}
          onAsignarSubcategoria={ficha.asignarSubcategoria}
          taxPercentage={ficha.selectedProduct.taxPercentage}
          savingEdit={ficha.savingEdit}
          confirmDelete={ficha.confirmDelete}
          deletingProduct={ficha.deletingProduct}
          onSubmit={ficha.handleSaveEdit}
          onEliminar={ficha.handleDeleteProduct}
          onCerrar={ficha.closeEditModal}
        />
      )}
    </div>
  )
}
