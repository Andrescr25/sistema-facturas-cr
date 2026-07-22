import { useFacturasBodega } from '../hooks/useFacturasBodega'
import { CheckCircle, AlertCircle } from 'lucide-react'
import HeaderBodega from '../components/facturas-bodega/HeaderBodega'
import ListadoFacturas from '../components/facturas-bodega/ListadoFacturas'
import DetalleDespacho from '../components/facturas-bodega/DetalleDespacho'
import ModalClienteCompletado from '../components/facturas-bodega/ModalClienteCompletado'
import ModalImagenProducto from '../components/inventario-auditoria/ModalImagenProducto'

export default function FacturasBodega() {
  const {
    facturaSeleccionada,
    faltantesDraft,
    loading,
    refreshing,
    guardando,
    error,
    ultimaSync,
    activeTab,
    setActiveTab,
    successMessage,
    setSuccessMessage,
    searchQuery,
    setSearchQuery,
    clienteCompletado,
    setClienteCompletado,
    filters,
    handleFilterChange,
    clearFilters,

    imagenProductoActivo,
    handleVerImagenProducto,
    handleCerrarImagenProducto,

    handleSeleccionarFactura,
    cancelarDespacho,
    marcarModoFaltante,
    actualizarCantidadFaltante,
    actualizarObservacionItem,

    accionPrincipalLabel,
    handleRegistrarFaltantes,

    facturasMostradas,
    checkedItemsCount,
    progressPercent,
    allItemsChecked
  } = useFacturasBodega()

  return (
    <div className="max-w-md mx-auto space-y-4 px-3 pt-2">
      <HeaderBodega refreshing={refreshing} ultimaSync={ultimaSync} />

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between text-green-800 text-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-500" />
            <span>{successMessage}</span>
          </div>
          <button className="text-xs underline text-green-600" onClick={() => setSuccessMessage(null)}>
            Ocultar
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-2 text-red-800 text-sm animate-fade-in">
          <AlertCircle size={16} className="text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 bg-white border border-gray-50 rounded-3xl">
          <div className="spinner mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Cargando facturas de bodega...</p>
        </div>
      ) : facturaSeleccionada ? (
        <DetalleDespacho
          facturaSeleccionada={facturaSeleccionada}
          faltantesDraft={faltantesDraft}
          checkedItemsCount={checkedItemsCount}
          progressPercent={progressPercent}
          allItemsChecked={allItemsChecked}
          guardando={guardando}
          accionPrincipalLabel={accionPrincipalLabel}
          onCancelar={cancelarDespacho}
          onMarcarModo={marcarModoFaltante}
          onCambiarCantidad={actualizarCantidadFaltante}
          onCambiarObservacion={actualizarObservacionItem}
          onRegistrarFaltantes={handleRegistrarFaltantes}
          onVerImagen={handleVerImagenProducto}
        />
      ) : (
        <ListadoFacturas
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={clearFilters}
          facturasMostradas={facturasMostradas}
          onSeleccionarFactura={handleSeleccionarFactura}
        />
      )}

      {clienteCompletado && (
        <ModalClienteCompletado
          clienteCompletado={clienteCompletado}
          onCerrar={() => setClienteCompletado(null)}
        />
      )}

      {imagenProductoActivo && (
        <ModalImagenProducto
          item={imagenProductoActivo}
          onCerrar={handleCerrarImagenProducto}
        />
      )}
    </div>
  )
}
