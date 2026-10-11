import { useParams } from 'react-router-dom'
import { AlertCircle, Loader } from 'lucide-react'
import { useRelacionarProductos } from '../hooks/useRelacionarProductos'
import ConfirmModal from '../components/ConfirmModal'
import ToastContainer from '../components/ToastContainer'
import HeaderProgreso from '../components/relacionar-productos/HeaderProgreso'
import FiltrosSegmentados from '../components/relacionar-productos/FiltrosSegmentados'
import ProductoRelacionarCard from '../components/relacionar-productos/ProductoRelacionarCard'
import ModalBuscarProducto from '../components/relacionar-productos/ModalBuscarProducto'
import ModalCrearProducto from '../components/relacionar-productos/ModalCrearProducto'
import ModalConversionCantidad from '../components/relacionar-productos/ModalConversionCantidad'
import ModalSugerirImagen from '../components/ModalSugerirImagen'

export default function RelacionarProductos() {
  const { facturaId } = useParams()
  const {
    factura,
    loading,
    error,
    filtro,
    setFiltro,
    productosFiltrados,
    stats,
    progreso,
    productoInfoPorLinea,

    modalBusqueda,
    productoSeleccionado,
    busqueda,
    setBusqueda,
    resultadosBusqueda,
    buscando,
    abrirModalBusqueda,
    cerrarModalBusqueda,
    relacionarProducto,

    modalCrear,
    setModalCrear,
    categorias,
    imagenPreview,
    abrirModalCrear,
    handleImagenChange,
    removerImagen,
    crearProducto,

    imagenModalOpen,
    imagenBusqueda,
    setImagenBusqueda,
    imagenSugerencias,
    cargandoImagenSugerencias,
    abrirBuscadorImagen,
    buscarSugerenciasImagen,
    cerrarBuscadorImagen,
    seleccionarImagenSugerida,
    handleSubirArchivoDesdeModal,

    modalConversion,
    productoRelacionado,
    cantidadProveedor,
    setCantidadProveedor,
    cantidadMia,
    setCantidadMia,
    guardarFactorConversion,
    omitirConversion,

    formaFarmaceutica,
    setFormaFarmaceutica,
    registroSanitario,
    setRegistroSanitario,
    impuestos,
    impuestoSugerido,
    porcentajeDeLaLinea,
    categoriaSeleccionada,
    handleCategoriaChange,
    codigoCabys,
    handleCabysChange,
    handleEsMedicamentoChange,
    mostrarCamposMedicamento,
    categoriaMedicamentoSeleccionada,

    cambiarRelacion,
    editarFactor,

    toasts,
    removeToast,
    dialogProps
  } = useRelacionarProductos(facturaId)

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <Loader className="mx-auto animate-spin mb-4" size={48} />
        <p className="text-neutro-600">Cargando factura...</p>
      </div>
    )
  }

  if (error || !factura) {
    return (
      <div className="max-w-7xl mx-auto py-12">
        <div className="card bg-peligro-50 border-peligro-200">
          <div className="flex items-center text-peligro-800">
            <AlertCircle className="mr-2" size={20} />
            {error || 'Factura no encontrada'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <HeaderProgreso factura={factura} progreso={progreso} stats={stats} />

      <FiltrosSegmentados filtro={filtro} setFiltro={setFiltro} stats={stats} />

      {/* Lista de productos */}
      <div className="space-y-4">
        {productosFiltrados.map(producto => (
          <ProductoRelacionarCard
            key={producto.id}
            producto={producto}
            productoInfo={productoInfoPorLinea[producto.id]}
            onRelacionar={abrirModalBusqueda}
            onCambiarRelacion={cambiarRelacion}
            onEditarFactor={editarFactor}
          />
        ))}
      </div>

      {modalBusqueda && (
        <ModalBuscarProducto
          productoSeleccionado={productoSeleccionado}
          busqueda={busqueda}
          setBusqueda={setBusqueda}
          resultadosBusqueda={resultadosBusqueda}
          buscando={buscando}
          onCerrar={cerrarModalBusqueda}
          onRelacionar={relacionarProducto}
          onCrearNuevo={() => {
            cerrarModalBusqueda()
            abrirModalCrear(productoSeleccionado)
          }}
        />
      )}

      {modalCrear && productoSeleccionado && (
        <ModalCrearProducto
          productoSeleccionado={productoSeleccionado}
          categorias={categorias}
          impuestos={impuestos}
          impuestoSugerido={impuestoSugerido}
          porcentajeDeLaLinea={porcentajeDeLaLinea}
          categoriaSeleccionada={categoriaSeleccionada}
          onCategoriaChange={handleCategoriaChange}
          codigoCabys={codigoCabys}
          onCabysChange={handleCabysChange}
          mostrarCamposMedicamento={mostrarCamposMedicamento}
          categoriaMedicamentoSeleccionada={categoriaMedicamentoSeleccionada}
          onEsMedicamentoChange={handleEsMedicamentoChange}
          formaFarmaceutica={formaFarmaceutica}
          setFormaFarmaceutica={setFormaFarmaceutica}
          registroSanitario={registroSanitario}
          setRegistroSanitario={setRegistroSanitario}
          imagenPreview={imagenPreview}
          onImagenChange={handleImagenChange}
          onRemoverImagen={removerImagen}
          onBuscarSugerenciaImagen={abrirBuscadorImagen}
          onSubmit={crearProducto}
          onCerrar={() => { setModalCrear(false); removerImagen() }}
        />
      )}

      {imagenModalOpen && productoSeleccionado && (
        <ModalSugerirImagen
          producto={{ name: productoSeleccionado.descripcion }}
          customSearchQuery={imagenBusqueda}
          setCustomSearchQuery={setImagenBusqueda}
          imageSuggestions={imagenSugerencias}
          loadingSuggestions={cargandoImagenSugerencias}
          assigningImage={false}
          onBuscar={buscarSugerenciasImagen}
          onAsignar={seleccionarImagenSugerida}
          onSubirArchivo={handleSubirArchivoDesdeModal}
          onCerrar={cerrarBuscadorImagen}
        />
      )}

      {modalConversion && productoRelacionado && (
        <ModalConversionCantidad
          productoRelacionado={productoRelacionado}
          cantidadProveedor={cantidadProveedor}
          setCantidadProveedor={setCantidadProveedor}
          cantidadMia={cantidadMia}
          setCantidadMia={setCantidadMia}
          onGuardar={guardarFactorConversion}
          onOmitir={omitirConversion}
        />
      )}

      <ConfirmModal {...dialogProps} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
