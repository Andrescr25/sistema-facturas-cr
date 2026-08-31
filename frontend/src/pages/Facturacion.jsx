import { Check, ShoppingCart } from 'lucide-react'
import { useFacturacion } from '../hooks/useFacturacion'
import HeaderFacturacion from '../components/facturacion/HeaderFacturacion'
import BannerRecordatorioActualizacion from '../components/facturacion/BannerRecordatorioActualizacion'
import TabsFacturacion from '../components/facturacion/TabsFacturacion'
import PanelEditarFacturas from '../components/facturacion/PanelEditarFacturas'
import StatsCache from '../components/facturacion/StatsCache'
import BannerModoEdicion from '../components/facturacion/BannerModoEdicion'
import BuscarCliente from '../components/facturacion/BuscarCliente'
import ClienteSeleccionado from '../components/facturacion/ClienteSeleccionado'
import EntradaProductos from '../components/facturacion/EntradaProductos'
import ItemFacturaRow from '../components/facturacion/ItemFacturaRow'
import ResumenTotales from '../components/facturacion/ResumenTotales'
import ModalCantidadMovil from '../components/facturacion/ModalCantidadMovil'

export default function Facturacion() {
  const {
    isOnline,
    isMobile,
    loading,
    syncingCache,
    tabActiva,
    cambiarTab,
    modoEdicion,
    facturaEditando,

    productos,
    facturasPendientes,

    clienteSeleccionado,
    deseleccionarCliente,
    items,
    DESCRIPCION_MAX,
    descuentoGlobal,

    codigoProducto,
    cantidadProducto,
    setCantidadProducto,
    modoEntradaRapida,
    setModoEntradaRapida,
    busquedaProducto,
    productosEncontrados,
    busquedaCliente,
    clientesEncontrados,

    busquedaFactura,
    facturasEncontradas,
    buscandoFacturas,
    edicionesPendientes,
    facturasPendientesDetalle,
    reintentandoLocalId,

    cacheStats,
    mensaje,
    mostrarRecordatorioActualizacion,
    ocultarRecordatorioActualizacion,

    modalCantidadProducto,
    productoSeleccionadoCantidad,
    cantidadSeleccionada,
    setCantidadSeleccionada,
    productoPreviewRapido,

    mostrarDetalles,
    toggleDetalles,

    codigoInputRef,
    cantidadInputRef,
    busquedaProductoInputRef,
    cantidadMovilInputRef,
    clienteCardRef,
    productoCardRef,

    actualizarCache,
    descartarEdicionPendiente,
    descartarFacturaPendiente,
    reintentarFacturaPendiente,
    cargarFacturaParaEdicion,
    handleCodigoKeyPress,
    handleCantidadKeyPress,
    abrirModalCantidadProducto,
    confirmarCantidadProducto,
    cerrarModalCantidadProducto,

    cambiarBusquedaCliente,
    focusBusquedaCliente,
    limpiarBusquedaCliente,
    seleccionarCliente,
    cambiarCodigoProducto,
    focusCodigoProducto,
    cambiarBusquedaProducto,
    focusBusquedaProducto,
    limpiarBusquedaProducto,
    cambiarBusquedaFactura,
    limpiarBusquedaFactura,

    eliminarItem,
    actualizarCantidadItem,
    validarCantidadItem,
    actualizarPrecioItem,
    actualizarDescuentoItem,
    actualizarDescripcionItem,
    finalizarFactura,
    limpiarFactura,

    calcularSubtotal,
    calcularImpuestos,
    calcularDescuentoGlobal,
    calcularTotal,
    impuestoPrincipal
  } = useFacturacion()

  if (loading && productos.length === 0) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="text-center py-12">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-neutro-600">Inicializando sistema de facturación...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${isMobile ? 'pb-10' : 'max-w-7xl mx-auto'}`}>
      <HeaderFacturacion
        isMobile={isMobile}
        isOnline={isOnline}
        facturasPendientesCount={facturasPendientes.length}
        syncingCache={syncingCache}
        onActualizarCache={actualizarCache}
      />

      {mostrarRecordatorioActualizacion && (
        <BannerRecordatorioActualizacion
          isMobile={isMobile}
          isOnline={isOnline}
          syncingCache={syncingCache}
          onActualizarCache={actualizarCache}
          onOcultar={ocultarRecordatorioActualizacion}
        />
      )}

      {/* Mensaje flotante */}
      {mensaje && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 ${mensaje.tipo === 'success' ? 'bg-exito-500 text-white' :
          mensaje.tipo === 'error' ? 'bg-peligro-500 text-white' :
            mensaje.tipo === 'warning' ? 'bg-alerta-500 text-white' :
              'bg-primario-500 text-white'
          }`}>
          <Check size={20} />
          <span>{mensaje.texto}</span>
        </div>
      )}

      <TabsFacturacion
        tabActiva={tabActiva}
        onCambiarTab={cambiarTab}
        modoEdicion={modoEdicion}
        edicionesPendientesCount={edicionesPendientes.length}
        isMobile={isMobile}
      />

      {tabActiva === 'editar' && (
        <PanelEditarFacturas
          isMobile={isMobile}
          isOnline={isOnline}
          busquedaFactura={busquedaFactura}
          onBusquedaFacturaChange={cambiarBusquedaFactura}
          onLimpiarBusquedaFactura={limpiarBusquedaFactura}
          buscandoFacturas={buscandoFacturas}
          facturasEncontradas={facturasEncontradas}
          onCargarFacturaParaEdicion={cargarFacturaParaEdicion}
          onActualizarCache={actualizarCache}
          edicionesPendientes={edicionesPendientes}
          onDescartarEdicionPendiente={descartarEdicionPendiente}
          facturasPendientesDetalle={facturasPendientesDetalle}
          onDescartarFacturaPendiente={descartarFacturaPendiente}
          onReintentarFacturaPendiente={reintentarFacturaPendiente}
          reintentandoLocalId={reintentandoLocalId}
        />
      )}

      {tabActiva === 'nueva' && cacheStats && (
        <StatsCache isMobile={isMobile} cacheStats={cacheStats} />
      )}

      {modoEdicion && facturaEditando && tabActiva === 'nueva' && (
        <BannerModoEdicion isMobile={isMobile} facturaEditando={facturaEditando} onCancelar={limpiarFactura} />
      )}

      {tabActiva === 'nueva' && (
        <>
          {!clienteSeleccionado ? (
            /* PASO 1: Buscar Cliente */
            <BuscarCliente
              isMobile={isMobile}
              cardRef={clienteCardRef}
              busquedaCliente={busquedaCliente}
              onBusquedaClienteChange={cambiarBusquedaCliente}
              onFocusBusqueda={focusBusquedaCliente}
              onLimpiarBusqueda={limpiarBusquedaCliente}
              clientesEncontrados={clientesEncontrados}
              onSeleccionarCliente={seleccionarCliente}
            />
          ) : (
            /* PASO 2: Agregar Productos y Datos de Facturación */
            <div className={`${isMobile ? 'px-4' : 'grid grid-cols-1 lg:grid-cols-3 gap-6'}`}>
              {/* Columna principal: Entrada de datos */}
              <div className={`${isMobile ? 'space-y-4' : 'lg:col-span-2 space-y-6'}`}>

                <ClienteSeleccionado isMobile={isMobile} cliente={clienteSeleccionado} onCambiarCliente={deseleccionarCliente} />

                <EntradaProductos
                  isMobile={isMobile}
                  cardRef={productoCardRef}
                  modoEntradaRapida={modoEntradaRapida}
                  setModoEntradaRapida={setModoEntradaRapida}
                  codigoInputRef={codigoInputRef}
                  codigoProducto={codigoProducto}
                  onCodigoChange={cambiarCodigoProducto}
                  onFocusCodigo={focusCodigoProducto}
                  onCodigoKeyPress={handleCodigoKeyPress}
                  productoPreviewRapido={productoPreviewRapido}
                  cantidadInputRef={cantidadInputRef}
                  cantidadProducto={cantidadProducto}
                  setCantidadProducto={setCantidadProducto}
                  onCantidadKeyPress={handleCantidadKeyPress}
                  busquedaProductoInputRef={busquedaProductoInputRef}
                  busquedaProducto={busquedaProducto}
                  onBusquedaProductoChange={cambiarBusquedaProducto}
                  onFocusBusquedaProducto={focusBusquedaProducto}
                  onLimpiarBusquedaProducto={limpiarBusquedaProducto}
                  productosEncontrados={productosEncontrados}
                  onSeleccionarProducto={abrirModalCantidadProducto}
                />

                {/* Lista de Productos en Factura */}
                {items.length > 0 && (
                  <div className="card shadow-md p-6 rounded-2xl">
                    <h3 className="text-lg md:text-xl font-bold mb-4 text-neutro-900 flex items-center gap-2">
                      <ShoppingCart size={22} className="text-primario-600" />
                      Productos Agregados ({items.length})
                    </h3>

                    <div className="space-y-4">
                      {items.map((item, index) => (
                        <ItemFacturaRow
                          key={item.id}
                          item={item}
                          index={index}
                          isMobile={isMobile}
                          mostrarDetalle={mostrarDetalles[item.id]}
                          onToggleDetalle={toggleDetalles}
                          onEliminar={eliminarItem}
                          onCambiarCantidad={actualizarCantidadItem}
                          onValidarCantidad={validarCantidadItem}
                          onCambiarPrecio={actualizarPrecioItem}
                          onCambiarDescuento={actualizarDescuentoItem}
                          onCambiarDescripcion={actualizarDescripcionItem}
                          DESCRIPCION_MAX={DESCRIPCION_MAX}
                        />
                      ))}

                      <ResumenTotales
                        isMobile={isMobile}
                        items={items}
                        descuentoGlobal={descuentoGlobal}
                        impuestoPrincipal={impuestoPrincipal}
                        subtotal={calcularSubtotal()}
                        impuestosTotal={calcularImpuestos()}
                        descuentoTotal={calcularDescuentoGlobal()}
                        total={calcularTotal()}
                        modoEdicion={modoEdicion}
                        loading={loading}
                        clienteSeleccionado={clienteSeleccionado}
                        onFinalizar={finalizarFactura}
                        onCancelar={limpiarFactura}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {/* Fin del formulario de factura */}

      {/* Modal de Cantidad para Móvil - Optimizado touch */}
      {modalCantidadProducto && productoSeleccionadoCantidad && (
        <ModalCantidadMovil
          producto={productoSeleccionadoCantidad}
          cantidad={cantidadSeleccionada}
          setCantidad={setCantidadSeleccionada}
          cantidadInputRef={cantidadMovilInputRef}
          onCerrar={cerrarModalCantidadProducto}
          onConfirmar={confirmarCantidadProducto}
        />
      )}
    </div>
  )
}
