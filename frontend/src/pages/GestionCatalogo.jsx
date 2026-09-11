import { useState } from 'react'
import { Image as ImageIcon, ExternalLink, Link as LinkIcon, Plus, Package, Tags } from 'lucide-react'
import { useGestionCatalogo } from '../hooks/useGestionCatalogo'
import Toast from '../components/Toast'
import Boton from '../components/ui/Boton'
import Pestanas from '../components/ui/Pestanas'
import FiltrosCatalogo from '../components/gestion-catalogo/FiltrosCatalogo'
import GridProductos from '../components/gestion-catalogo/GridProductos'
import ModalProducto from '../components/gestion-catalogo/ModalProducto'
import ModalSugerirImagen from '../components/ModalSugerirImagen'
import TablaCatalogo from '../components/configuracion/TablaCatalogo'
import ModalElementoCatalogo from '../components/configuracion/ModalElementoCatalogo'
import { urlArchivo } from '../utils/urlArchivo'

/**
 * Las categorías usan la misma tabla y el mismo formulario que los catálogos
 * de Configuración: lo que cambia es esta descripción.
 */
const CATEGORIAS = {
  clave: 'categorias',
  texto: 'Categorías',
  singular: 'categoría',
  uno: 'una categoría',
  icono: Tags,
  descripcion: 'Agrupan los productos en los catálogos y en los reportes. Una inactiva no se ofrece para productos nuevos, pero los que ya la tienen la conservan.',
  columnas: [
    { campo: 'nombre', titulo: 'Nombre', principal: true },
    { campo: 'productos', titulo: 'Productos activos' }
  ],
  campos: [{ campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 80 }],
  nuevo: { nombre: '' }
}

export default function GestionCatalogo() {
  const g = useGestionCatalogo()
  const [pestana, setPestana] = useState('productos')
  const [edicionCategoria, setEdicionCategoria] = useState(null)

  const catalogoAgenteUrl = `${window.location.origin}/catalogo-agente`

  const handleCopiarLinkCatalogo = async () => {
    try {
      await navigator.clipboard.writeText(catalogoAgenteUrl)
      g.setToast({ type: 'success', message: 'Link del catálogo copiado.' })
    } catch (error) {
      g.setToast({ type: 'error', message: 'No se pudo copiar el link.' })
    }
  }

  const pestanas = [
    { clave: 'productos', texto: 'Productos', icono: Package, contador: g.totalProductos },
    { clave: 'categorias', texto: 'Categorías', icono: Tags, contador: g.categorias.filter(c => c.activo).length }
  ]

  return (
    <div className="space-y-6">
      {g.toast && (
        <Toast type={g.toast.type} message={g.toast.message} onClose={() => g.setToast(null)} />
      )}

      <div className="bg-gradient-to-r from-primario-600 to-primario-700 rounded-xl shadow-lg p-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
            <ImageIcon className="h-7 w-7" /> Gestión de Catálogo
          </h1>
          <p className="text-primario-100 mt-1">
            Los productos, sus fotos, precios e impuestos, y sus categorías.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
            <span className="text-primario-100">Ver catálogo:</span>
            <a
              href="/catalogo-agente"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-white underline underline-offset-2 hover:text-primario-100"
            >
              {catalogoAgenteUrl}
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

        <Boton variante="secundario" onClick={g.abrirNuevo}>
          <Plus size={16} /> Nuevo producto
        </Boton>
      </div>

      <Pestanas activa={pestana} onCambiar={setPestana} pestanas={pestanas} />

      {pestana === 'productos' ? (
        <>
          <FiltrosCatalogo
            searchQuery={g.searchQuery}
            setSearchQuery={g.setSearchQuery}
            missingImageOnly={g.missingImageOnly}
            setMissingImageOnly={g.setMissingImageOnly}
            proveedorFiltro={g.proveedorFiltro}
            setProveedorFiltro={g.setProveedorFiltro}
            proveedoresCatalogo={g.proveedoresCatalogo}
            estadoFiltro={g.estadoFiltro}
            setEstadoFiltro={g.setEstadoFiltro}
            totalProductos={g.totalProductos}
          />

          <GridProductos
            productos={g.productos}
            loading={g.loading}
            currentPage={g.currentPage}
            totalPages={g.totalPages}
            setCurrentPage={g.setCurrentPage}
            onSugerirFoto={g.openImageSuggestions}
            onAgregarMarca={g.abrirOtraMarca}
            onEditar={g.abrirEditar}
          />
        </>
      ) : (
        <TablaCatalogo
          definicion={CATEGORIAS}
          filas={g.categorias}
          trabajando={false}
          onAgregar={() => setEdicionCategoria({ fila: null })}
          onEditar={fila => setEdicionCategoria({ fila })}
          onCambiarActivo={g.cambiarActivoCategoria}
        />
      )}

      {g.isImageModalOpen && g.selectedProduct && (
        <ModalSugerirImagen
          producto={{ ...g.selectedProduct, name: g.selectedProduct.nombre, reference: g.selectedProduct.referencia, imageUrl: urlArchivo(g.selectedProduct.imagen_url) }}
          customSearchQuery={g.customSearchQuery}
          setCustomSearchQuery={g.setCustomSearchQuery}
          imageSuggestions={g.imageSuggestions}
          loadingSuggestions={g.loadingSuggestions}
          assigningImage={g.assigningImage}
          onBuscar={g.fetchImageSuggestions}
          onAsignar={g.handleAssignImage}
          onSubirArchivo={g.handleSubirArchivoImagen}
          onCerrar={() => g.setIsImageModalOpen(false)}
        />
      )}

      {g.edicion && (
        <ModalProducto
          key={g.edicion.producto?.id ?? (g.edicion.plantilla ? `marca-${g.edicion.plantilla.id}` : 'nuevo')}
          producto={g.edicion.producto}
          plantilla={g.edicion.plantilla}
          categorias={g.categorias}
          impuestos={g.impuestos}
          guardando={g.guardando}
          onGuardar={g.guardarProducto}
          onCambiarEstado={g.cambiarEstadoProducto}
          onCerrar={g.cerrarEdicion}
        />
      )}

      {edicionCategoria && (
        <ModalElementoCatalogo
          key={edicionCategoria.fila?.id ?? 'nueva'}
          definicion={CATEGORIAS}
          fila={edicionCategoria.fila}
          guardando={false}
          onGuardar={valores => g.guardarCategoria(edicionCategoria.fila?.id, valores)}
          onCerrar={() => setEdicionCategoria(null)}
        />
      )}
    </div>
  )
}
