import { Printer, AlertCircle } from 'lucide-react'
import { useImpresion } from '../hooks/useImpresion'
import ConfirmModal from '../components/ConfirmModal'
import ModalAjustandoPrecios from '../components/impresion/ModalAjustandoPrecios'
import TabsImpresion from '../components/impresion/TabsImpresion'
import ListaFacturasPendientes from '../components/impresion/ListaFacturasPendientes'
import ListaFacturasProcesadas from '../components/impresion/ListaFacturasProcesadas'
import CambiosAutomaticos from '../components/impresion/CambiosAutomaticos'
import FormularioEdicionFactura from '../components/impresion/FormularioEdicionFactura'

export default function Impresion() {
  const {
    activeTab,
    setActiveTab,
    facturasPendientes,
    facturasProcesadas,
    loading,
    error,

    facturaEditando,
    itemsEditados,
    modoEdicion,
    procesando,
    ajustandoPrecios,
    mensajeAjuste,
    productoBusqueda,

    handleVerPDF,
    handleIniciarEdicion,
    abrirRevision,
    handleCancelarEdicion,
    handleAgregarItem,
    handleGuardarFactura,
    handleProcesarSinCambios,
    handleRecuperarFactura,
    iniciarBusquedaProducto,
    manejarCambioTerminoBusqueda,
    seleccionarProductoBusqueda,
    handleItemChange,
    handleEliminarItem,

    dialogProps
  } = useImpresion()

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-3">
      {/* Modal de Ajuste de Precios */}
      {ajustandoPrecios && <ModalAjustandoPrecios mensaje={mensajeAjuste} />}

      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <Printer className="text-blue-600" size={28} />
            Centro de Impresión
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Imprime facturas resueltas o con cambios pendientes y refleja los precios revisados
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-2.5 text-red-800 text-sm">
          <AlertCircle className="text-red-500" size={18} />
          <p>Error: {error}</p>
        </div>
      )}

      <TabsImpresion
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        countPendientes={facturasPendientes.length}
        countProcesadas={facturasProcesadas.length}
      />

      {/* Loading */}
      {loading && (
        <div className="text-center py-16 bg-white border border-gray-50 rounded-3xl">
          <div className="spinner mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">
            {activeTab === 'pendientes' ? 'Cargando facturas pendientes...' : 'Cargando facturas procesadas...'}
          </p>
        </div>
      )}

      {/* Lista de Pendientes (Con y Sin cambios) */}
      {activeTab === 'pendientes' && !loading && (
        <div>
          {facturaEditando ? (
            modoEdicion ? (
              <FormularioEdicionFactura
                facturaEditando={facturaEditando}
                itemsEditados={itemsEditados}
                procesando={procesando}
                productoBusqueda={productoBusqueda}
                onCancelar={handleCancelarEdicion}
                onAgregarItem={handleAgregarItem}
                onEliminarItem={handleEliminarItem}
                onItemChange={handleItemChange}
                onIniciarBusqueda={iniciarBusquedaProducto}
                onCambiarTermino={manejarCambioTerminoBusqueda}
                onSeleccionarProducto={seleccionarProductoBusqueda}
                onGuardar={handleGuardarFactura}
              />
            ) : (
              <CambiosAutomaticos
                factura={facturaEditando}
                procesando={procesando}
                onEditar={handleIniciarEdicion}
                onVerPDF={handleVerPDF}
                onGuardar={handleGuardarFactura}
              />
            )
          ) : (
            <ListaFacturasPendientes
              facturas={facturasPendientes}
              procesando={procesando}
              onVerPDF={handleVerPDF}
              onProcesarSinCambios={handleProcesarSinCambios}
              onAbrirRevision={abrirRevision}
            />
          )}
        </div>
      )}

      {/* Tab Procesadas */}
      {activeTab === 'procesadas' && !loading && (
        <ListaFacturasProcesadas
          facturas={facturasProcesadas}
          onVerPDF={handleVerPDF}
          onRecuperar={handleRecuperarFactura}
        />
      )}

      <ConfirmModal {...dialogProps} />
    </div>
  )
}
