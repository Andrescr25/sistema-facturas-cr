import { Printer, AlertCircle } from 'lucide-react'
import { useImpresion } from '../hooks/useImpresion'
import ConfirmModal from '../components/ConfirmModal'
import ModalAjustandoPrecios from '../components/impresion/ModalAjustandoPrecios'
import TabsImpresion from '../components/impresion/TabsImpresion'
import ListaFacturasPendientes from '../components/impresion/ListaFacturasPendientes'
import ListaFacturasProcesadas from '../components/impresion/ListaFacturasProcesadas'
import CambiosAutomaticos from '../components/impresion/CambiosAutomaticos'
import FormularioEdicionFactura from '../components/impresion/FormularioEdicionFactura'
import EmitirEImprimir from '../components/impresion/EmitirEImprimir'
import { useAuth } from '../contexts/AuthContext'
import { puedeVer } from '../utils/modulos'
import { seEmiteAlImprimir } from '../utils/impresionUtils'

export default function Impresion() {
  // Emitir usa las rutas de Facturación: sin ese módulo no se ofrece.
  const { usuario } = useAuth()
  const puedeEmitir = puedeVer(usuario, '/facturacion')
  const {
    activeTab,
    setActiveTab,
    facturasPendientes,
    facturasProcesadas,
    historial,
    verMasProcesadas,
    loading,
    error,

    facturaEditando,
    itemsEditados,
    cargandoItems,
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
    iniciarBusquedaProducto,
    manejarCambioTerminoBusqueda,
    seleccionarProductoBusqueda,
    handleItemChange,
    handleEliminarItem,

    porEmitir,
    cerrarEmision,

    dialogProps
  } = useImpresion()
  const emitible = Boolean(facturaEditando) && puedeEmitir && seEmiteAlImprimir(facturaEditando)

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-3">
      {/* Modal de Ajuste de Precios */}
      {ajustandoPrecios && <ModalAjustandoPrecios mensaje={mensajeAjuste} />}

      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-neutro-900 flex items-center gap-2.5">
            <Printer className="text-primario-600" size={28} />
            Centro de Impresión
          </h1>
          <p className="text-sm text-neutro-500 mt-0.5">
            Imprime facturas resueltas o con cambios pendientes y refleja los precios revisados
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-peligro-50 border border-peligro-200 rounded-2xl p-4 flex items-center gap-2.5 text-peligro-800 text-sm">
          <AlertCircle className="text-peligro-500" size={18} />
          <p>Error: {error}</p>
        </div>
      )}

      <TabsImpresion
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        countPendientes={facturasPendientes.length}
        countProcesadas={historial.total}
      />

      {/* Loading */}
      {loading && (
        <div className="text-center py-16 bg-white border border-neutro-50 rounded-3xl">
          <div className="spinner mx-auto mb-3"></div>
          <p className="text-sm text-neutro-500">
            {activeTab === 'pendientes' ? 'Cargando facturas pendientes...' : 'Cargando facturas procesadas...'}
          </p>
        </div>
      )}

      {/* Lista de Pendientes (Con y Sin cambios) */}
      {activeTab === 'pendientes' && !loading && (
        <div>
          {/* La revisión de cambios automáticos sigue reemplazando la lista:
              es un paso del flujo, no una ventana. La EDICIÓN sí es un modal
              y va encima, así la lista no desaparece de la vista mientras se
              corrige una factura. */}
          {facturaEditando && !modoEdicion ? (
            <CambiosAutomaticos
              factura={facturaEditando}
              procesando={procesando}
              onEditar={handleIniciarEdicion}
              onVerPDF={handleVerPDF}
              onGuardar={handleGuardarFactura}
              emitible={emitible}
            />
          ) : (
            <ListaFacturasPendientes
              facturas={facturasPendientes}
              procesando={procesando}
              puedeEmitir={puedeEmitir}
              onVerPDF={handleVerPDF}
              onProcesarSinCambios={handleProcesarSinCambios}
              onAbrirRevision={abrirRevision}
            />
          )}
        </div>
      )}

      {facturaEditando && modoEdicion && (
        <FormularioEdicionFactura
          facturaEditando={facturaEditando}
          itemsEditados={itemsEditados}
          cargandoItems={cargandoItems}
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
          emitible={emitible}
        />
      )}

      {/* «Imprimir y emitir»: la factura ya está guardada con sus ajustes. */}
      {porEmitir && <EmitirEImprimir factura={porEmitir} onImprimir={handleVerPDF} onCerrar={cerrarEmision} />}

      {/* Tab Procesadas */}
      {activeTab === 'procesadas' && !loading && (
        <ListaFacturasProcesadas
          facturas={facturasProcesadas}
          historial={historial}
          onVerPDF={handleVerPDF}
          onVerMas={verMasProcesadas}
        />
      )}

      <ConfirmModal {...dialogProps} />
    </div>
  )
}
