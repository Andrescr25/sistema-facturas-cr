import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink, ImageOff, Layers, Link as LinkIcon, Package, RefreshCw, Search, X } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../hooks/useToast'
import { useDialog } from '../hooks/useDialog'
import { useTaxonomiaCatalogo } from '../hooks/useTaxonomiaCatalogo'
import { useListaCatalogo } from '../hooks/useListaCatalogo'
import { useSeleccionLote } from '../hooks/useSeleccionLote'
import { useFichaCatalogo } from '../hooks/useFichaCatalogo'
import { useAccionesLote } from '../hooks/useAccionesLote'
import ToastContainer from '../components/ToastContainer'
import ConfirmModal from '../components/ConfirmModal'
import Boton from '../components/ui/Boton'
import TarjetasResumen from '../components/pagos/TarjetasResumen'
import SkeletonContraparte from '../components/pagos/SkeletonContraparte'
import CuadriculaCategorias from '../components/gestion-catalogo/CuadriculaCategorias'
import DetalleCategoria from '../components/gestion-catalogo/DetalleCategoria'
import ResultadosBusqueda from '../components/gestion-catalogo/ResultadosBusqueda'
import BarraLote from '../components/gestion-catalogo/BarraLote'
import ModalSugerirImagen from '../components/ModalSugerirImagen'
import ModalDuplicarMarca from '../components/gestion-catalogo/ModalDuplicarMarca'
import ModalProducto from '../components/gestion-catalogo/ModalProducto'

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

/**
 * Gestión de Catálogo, con la forma del resto del sistema (Cuentas por
 * Cobrar, el reporte de proveedores): título, tarjetas de resumen que sirven
 * de filtro, una tarjeta grande por categoría —con sus subcategorías
 * adentro— y, al entrar a una, sus subcategorías como tarjetas con sus
 * productos.
 *
 * TODO EN EL ORDEN DEL AGENTE: las categorías como vienen de GET /arbol
 * (categoria_config.orden) y las subcategorías con compararSubcategorias, la
 * misma función que usa el catálogo del agente. Lo que se acomoda acá es lo
 * que el agente ve.
 *
 * Las dos tareas que más tiempo llevan tienen su atajo en las tarjetas de
 * arriba: "Sin clasificar" deja solo las categorías con productos por
 * acomodar y entra directo a ellos; "Sin foto" hace lo mismo con las fotos.
 */
export default function GestionCatalogo() {
  const { toasts, showToast, removeToast } = useToast()
  const { confirm, dialogProps } = useDialog()
  const mostrarToast = useCallback((type, message) => showToast(message, type), [showToast])
  const [syncing, setSyncing] = useState(false)
  // Mismo formato que usan las tarjetas de Cuentas por Cobrar: `estado` es el
  // atajo elegido (todos | sinClasificar | sinFoto).
  const [vista, setVista] = useState({ estado: 'todos', dias: 'todos' })

  const taxonomia = useTaxonomiaCatalogo()
  const { arbol, loadingArbol, categoriaActiva, subFoco, sinAlegra, errorArbol } = taxonomia

  const lista = useListaCatalogo({ arbol, categoriaActiva, subFoco })
  const seleccion = useSeleccionLote()

  // Lo seleccionado es de lo que se estaba mirando: al cambiar de lugar se suelta.
  useEffect(() => {
    seleccion.limpiar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaActiva, subFoco, lista.busquedaActiva])

  // En la cuadrícula, "Sin foto" también filtra los resultados de búsqueda.
  useEffect(() => {
    if (!categoriaActiva) lista.setSoloSinImagen(vista.estado === 'sinFoto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista.estado, categoriaActiva])

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
    recargarArbol: taxonomia.recargarArbol,
    recargarLista: lista.recargar,
    mostrarToast
  })

  const totales = useMemo(() => arbol.reduce((t, c) => ({
    productos: t.productos + c.total,
    sinClasificar: t.sinClasificar + c.sinClasificar,
    sinImagen: t.sinImagen + (c.sinImagen || 0),
    subcategorias: t.subcategorias + c.subcategorias.length
  }), { productos: 0, sinClasificar: 0, sinImagen: 0, subcategorias: 0 }), [arbol])

  const tarjetas = arbol.length ? [
    { clave: 'productos', titulo: 'Productos', icono: Package, tono: 'neutro', valor: totales.productos, pie: `en ${plural(arbol.length, 'categoría', 'categorías')}` },
    { clave: 'sinClasificar', titulo: 'Sin clasificar', icono: AlertTriangle, tono: 'alerta', valor: totales.sinClasificar, filtro: { estado: 'sinClasificar' } },
    { clave: 'sinFoto', titulo: 'Sin foto', icono: ImageOff, tono: 'peligro', valor: totales.sinImagen, filtro: { estado: 'sinFoto' } },
    { clave: 'subcategorias', titulo: 'Subcategorías', icono: Layers, tono: 'exito', valor: totales.subcategorias }
  ] : []

  const filtrada = vista.estado !== 'todos'
  const categoriasVisibles = vista.estado === 'sinClasificar'
    ? arbol.filter((c) => c.sinClasificar > 0)
    : vista.estado === 'sinFoto'
      ? arbol.filter((c) => c.sinImagen > 0)
      : arbol
  // Solo las que tienen id de Alegra: sin él no hay a dónde mandar el cambio
  // (pasa cuando Alegra no respondió y las categorías salieron de la copia local).
  const otrasCategorias = arbol.filter((c) => c.id != null && c.name !== categoriaActiva)

  const entrar = (nombre, foco) => {
    // Con un atajo de arriba elegido, se entra directo a lo pendiente.
    const focoFinal = foco !== undefined ? foco : (vista.estado === 'sinClasificar' ? 'sin' : null)
    lista.setSoloSinImagen(vista.estado === 'sinFoto')
    taxonomia.seleccionarCategoria(nombre, focoFinal)
    window.scrollTo({ top: 0 })
  }

  const volver = () => {
    taxonomia.volverALista()
    window.scrollTo({ top: 0 })
  }

  const moverSubcategoria = async (sub, destino) => {
    if (destino.id == null) {
      mostrarToast('error', 'Alegra no está respondiendo: por ahora no se puede mover nada de categoría.')
      return
    }
    const origen = sub.categoriaVisible || sub.categoria
    const ok = await confirm(
      `"${sub.nombre}" pasa completa de ${origen} a ${destino.nombreVisible}, con ${plural(sub.productos, 'producto', 'productos')}. ` +
      'Cada uno cambia de categoría en Alegra (unos segundos por producto) y siguen agrupados en la misma subcategoría.',
      { title: 'Mover subcategoría', confirmLabel: 'Mover' }
    )
    if (!ok) return
    if (subFoco === sub.id) taxonomia.enfocar(null)
    acciones.moverSubcategoria(sub, destino)
  }

  const moverSeleccionASubcategoria = async (subcategoriaId) => {
    const ok = await acciones.moverASubcategoria([...seleccion.seleccionados], subcategoriaId)
    if (ok) seleccion.limpiar()
  }

  const cambiarCategoriaDeSeleccion = async (destino) => {
    const ids = [...seleccion.seleccionados]
    const ok = await confirm(
      `${plural(ids.length, 'producto pasa', 'productos pasan')} a ${destino.nombreVisible}. ` +
      'Se cambia la categoría en Alegra, uno por uno, y allá quedan en "Sin clasificar".',
      { title: 'Cambiar de categoría', confirmLabel: 'Cambiar' }
    )
    if (!ok) return
    if (await acciones.cambiarCategoria(ids, destino)) seleccion.limpiar()
  }

  const eliminarSubcategoria = (id) =>
    taxonomia.eliminarSubcategoria(categoriaActiva, id).catch((e) => {
      mostrarToast('error', e?.response?.data?.message || 'No se pudo borrar la subcategoría.')
    })

  const sincronizar = async () => {
    setSyncing(true)
    mostrarToast('info', 'Sincronizando con Alegra… puede tardar unos minutos.')
    try {
      // En producción ya se vio tardar más de 3 minutos con 2000+ productos.
      const { data } = await api.post('/alegra/sincronizar/cache-productos', {}, { timeout: 10 * 60 * 1000 })
      if (data?.success) {
        mostrarToast('success', `Sincronización lista: ${data.count} productos.`)
        taxonomia.recargarArbol()
        lista.recargar()
      } else {
        mostrarToast('error', 'La sincronización falló.')
      }
    } catch (error) {
      console.error('Sync catalog error:', error)
      mostrarToast('error', 'Error del servidor durante la sincronización.')
    } finally {
      setSyncing(false)
    }
  }

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/catalogo-agente`)
      mostrarToast('success', 'Link del catálogo copiado.')
    } catch {
      mostrarToast('error', 'No se pudo copiar el link.')
    }
  }

  const accionesFila = {
    onEditar: ficha.openEditProduct,
    onSugerirFoto: ficha.openImageSuggestions,
    onDuplicar: ficha.openBrandDuplication
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-48">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <ConfirmModal {...dialogProps} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutro-900">Gestión de Catálogo</h1>
          <p className="mt-1 text-neutro-600">Categorías, subcategorías y fotos — en el mismo orden en que las ve el agente.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" icono={ExternalLink} onClick={() => window.open('/catalogo-agente', '_blank', 'noopener')}>
            Ver catálogo
          </Boton>
          <Boton variante="secundario" icono={LinkIcon} onClick={copiarLink}>Copiar link</Boton>
          <Boton icono={RefreshCw} cargando={syncing} onClick={sincronizar}>
            {syncing ? 'Sincronizando…' : 'Sincronizar con Alegra'}
          </Boton>
        </div>
      </div>

      {sinAlegra && (
        <div className="flex items-start gap-3 rounded-xl border border-alerta-200 bg-alerta-50 px-5 py-4 text-alerta-800">
          <AlertTriangle size={22} className="mt-0.5 shrink-0" />
          <p className="text-base">
            Alegra no está respondiendo: las categorías salen de la copia local. Se puede ver, clasificar en
            subcategorías y poner fotos, pero mover productos de categoría y crear categorías vuelve cuando Alegra responda.
          </p>
        </div>
      )}

      {!categoriaActiva ? (
        <>
          <TarjetasResumen tarjetas={tarjetas} filtros={vista} setFiltros={setVista} />

          <div className="flex flex-col gap-3 rounded-xl border border-neutro-100 bg-white p-4 shadow-sm md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
              <input
                value={lista.busqueda}
                onChange={(e) => lista.setBusqueda(e.target.value)}
                placeholder="Buscar un producto en todo el catálogo, por nombre o referencia…"
                className="w-full rounded-xl border border-neutro-200 bg-neutro-50 py-3 pl-10 pr-10 text-base text-neutro-900 focus:border-primario-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primario-500/30"
              />
              {lista.busqueda && (
                <button type="button" onClick={() => lista.setBusqueda('')} title="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutro-400 hover:bg-neutro-100 hover:text-neutro-700">
                  <X size={18} />
                </button>
              )}
            </div>
            {filtrada && (
              <button type="button" onClick={() => setVista({ estado: 'todos', dias: 'todos' })}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primario-50 px-4 py-3 text-sm font-semibold text-primario-700 ring-1 ring-primario-200 hover:bg-primario-100">
                Solo {vista.estado === 'sinClasificar' ? 'sin clasificar' : 'sin foto'} <X size={16} />
              </button>
            )}
          </div>

          {lista.busquedaActiva ? (
            <ResultadosBusqueda
              busqueda={lista.busqueda}
              resultados={lista.resultados}
              loading={lista.loading}
              alternar={seleccion.alternar}
              estaSeleccionado={seleccion.estaSeleccionado}
              {...accionesFila}
            />
          ) : loadingArbol && arbol.length === 0 ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              <SkeletonContraparte /><SkeletonContraparte /><SkeletonContraparte />
            </div>
          ) : errorArbol && arbol.length === 0 ? (
            <div className="rounded-xl border border-peligro-200 bg-white py-14 text-center shadow-sm">
              <AlertTriangle size={48} className="mx-auto mb-3 text-peligro-400" />
              <p className="mb-1 text-lg font-bold text-neutro-900">No se pudieron cargar las categorías</p>
              <p className="mb-5 text-neutro-500">{errorArbol}</p>
              <Boton icono={RefreshCw} onClick={() => taxonomia.recargarArbol()}>Reintentar</Boton>
            </div>
          ) : (
            <CuadriculaCategorias
              categorias={categoriasVisibles}
              filtrada={filtrada}
              puedeCrear={!sinAlegra}
              onEntrar={entrar}
              onReordenar={taxonomia.reordenarCategorias}
              onSoltarSubcategoria={moverSubcategoria}
              onCrearCategoria={taxonomia.crearCategoria}
            />
          )}
        </>
      ) : lista.categoria ? (
        <DetalleCategoria
          key={categoriaActiva}
          categoria={lista.categoria}
          subsOrdenadas={lista.subsOrdenadas}
          secciones={lista.secciones}
          loading={lista.loading}
          subFoco={subFoco}
          filtroTexto={lista.filtroTexto}
          setFiltroTexto={lista.setFiltroTexto}
          soloSinImagen={lista.soloSinImagen}
          setSoloSinImagen={lista.setSoloSinImagen}
          hayFiltro={lista.hayFiltro}
          otrasCategorias={otrasCategorias}
          alternar={seleccion.alternar}
          estaSeleccionado={seleccion.estaSeleccionado}
          seleccionarTodos={seleccion.seleccionarTodos}
          deseleccionarTodos={seleccion.deseleccionarTodos}
          onVolver={volver}
          onEnfocar={taxonomia.enfocar}
          onRenombrarCategoria={(nombreVisible) => taxonomia.renombrarCategoria(categoriaActiva, nombreVisible)}
          onCrearSub={(nombre) => taxonomia.crearSubcategoria(categoriaActiva, nombre)}
          onRenombrarSub={(id, nombre) => taxonomia.renombrarSubcategoria(categoriaActiva, id, nombre)}
          onReordenarSub={(ids) => taxonomia.reordenarSubcategorias(categoriaActiva, ids)}
          onEliminarSub={eliminarSubcategoria}
          onMoverSub={(sub, destino) => moverSubcategoria(
            { ...sub, categoria: categoriaActiva, categoriaVisible: lista.categoria.nombreVisible }, destino
          )}
          {...accionesFila}
        />
      ) : (
        // La categoría abierta ya no está en el árbol (se recargó mientras
        // tanto): siempre hay por dónde volver, nunca una pantalla en blanco.
        <div className="rounded-xl border border-neutro-100 bg-white py-16 text-center shadow-sm">
          <Package size={48} className="mx-auto mb-3 text-neutro-300" />
          <p className="mb-4 font-semibold text-neutro-700">Esa categoría ya no está en el catálogo.</p>
          <Boton onClick={volver}>Volver a categorías</Boton>
        </div>
      )}

      <BarraLote
        cantidad={seleccion.cantidad}
        enBusqueda={!categoriaActiva}
        subsDeLaCategoria={lista.subsOrdenadas}
        otrasCategorias={otrasCategorias}
        moviendo={acciones.moviendo}
        trabajo={acciones.trabajo}
        onMoverASubcategoria={moverSeleccionASubcategoria}
        onCambiarCategoria={cambiarCategoriaDeSeleccion}
        onCerrarTrabajo={acciones.cerrarTrabajo}
        onLimpiar={seleccion.limpiar}
      />

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
