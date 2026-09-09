import { ShoppingCart, PackageOpen } from 'lucide-react'
import { useFacturacion } from '../hooks/useFacturacion'
import CabeceraFacturacion from '../components/facturacion/CabeceraFacturacion'
import PestanasFacturacion from '../components/facturacion/PestanasFacturacion'
import AvisoFlotante from '../components/facturacion/AvisoFlotante'
import AvisoActualizar from '../components/facturacion/AvisoActualizar'
import AvisoEdicion from '../components/facturacion/AvisoEdicion'
import EstadoCatalogo from '../components/facturacion/EstadoCatalogo'
import PasoCliente from '../components/facturacion/PasoCliente'
import TarjetaCliente from '../components/facturacion/TarjetaCliente'
import AgregarProductos from '../components/facturacion/AgregarProductos'
import LineaFactura from '../components/facturacion/LineaFactura'
import PanelCobro from '../components/facturacion/PanelCobro'
import ModalCantidad from '../components/facturacion/ModalCantidad'
import PanelEditarFacturas from '../components/facturacion/PanelEditarFacturas'

/**
 * Facturación.
 *
 * QUÉ SE REHIZO Y POR QUÉ
 * La versión anterior decidía el diseño en JavaScript: el hook exponía
 * `isMobile` y cada uno de los doce componentes recibía esa bandera y
 * devolvía un árbol distinto según su valor. Eso traía tres problemas, y los
 * tres se notaban justo en el teléfono, que es donde peor andaba:
 *
 *   1. `isMobile` arranca en `false`. En un teléfono, la primera pintada era
 *      la de escritorio y saltaba a la otra al montar el componente.
 *   2. No había comportamiento intermedio. Una tableta de 800px caía de un
 *      lado o del otro de un salto, sin nada que se adaptara de verdad.
 *   3. Cada componente tenía dos caminos que mantener, y se habían ido
 *      separando solos: espaciados distintos, tamaños distintos, un detalle
 *      arreglado en una rama y no en la otra.
 *
 * Ahora el diseño lo decide CSS y `isMobile` queda solo para lo que sí es
 * comportamiento —a dónde mandar el foco, cuándo hacer scroll—, que es para
 * lo que el hook lo usa internamente.
 *
 * EL OTRO ARREGLO GRANDE: DÓNDE ESTÁ EL BOTÓN DE FACTURAR
 * Estaba al final de la lista de productos, dentro de la misma tarjeta. Con
 * quince líneas en un teléfono había que recorrer la factura entera para
 * llegar a cerrarla. Ahora el cobro vive en `PanelCobro`: barra fija abajo
 * en pantalla angosta, columna derecha pegada en escritorio — que además
 * llena el tercio que la rejilla ya reservaba (`lg:grid-cols-3` con el
 * contenido ocupando dos) y que hasta hoy quedaba en blanco.
 */
export default function Facturacion() {
  const {
    isOnline, loading, syncingCache,
    tabActiva, cambiarTab, modoEdicion, facturaEditando,
    productos, facturasPendientes,
    clienteSeleccionado, deseleccionarCliente, items, DESCRIPCION_MAX, descuentoGlobal,
    codigoProducto, cantidadProducto, setCantidadProducto,
    modoEntradaRapida, setModoEntradaRapida,
    busquedaProducto, productosEncontrados,
    busquedaCliente, clientesEncontrados,
    busquedaFactura, facturasEncontradas, buscandoFacturas,
    edicionesPendientes, facturasPendientesDetalle, reintentandoLocalId,
    cacheStats, mensaje,
    mostrarRecordatorioActualizacion, ocultarRecordatorioActualizacion,
    modalCantidadProducto, productoSeleccionadoCantidad,
    cantidadSeleccionada, setCantidadSeleccionada, productoPreviewRapido,
    mostrarDetalles, toggleDetalles,
    codigoInputRef, cantidadInputRef, busquedaProductoInputRef,
    cantidadMovilInputRef, clienteCardRef, productoCardRef,
    actualizarCache, descartarEdicionPendiente, descartarFacturaPendiente,
    reintentarFacturaPendiente, cargarFacturaParaEdicion,
    handleCodigoKeyPress, handleCantidadKeyPress,
    abrirModalCantidadProducto, confirmarCantidadProducto, cerrarModalCantidadProducto,
    cambiarBusquedaCliente, focusBusquedaCliente, limpiarBusquedaCliente, seleccionarCliente,
    cambiarCodigoProducto, focusCodigoProducto,
    cambiarBusquedaProducto, focusBusquedaProducto, limpiarBusquedaProducto,
    cambiarBusquedaFactura, limpiarBusquedaFactura,
    eliminarItem, actualizarCantidadItem, validarCantidadItem,
    actualizarPrecioItem, actualizarDescuentoItem, actualizarDescripcionItem,
    finalizarFactura, limpiarFactura,
    calcularSubtotal, calcularImpuestos, calcularDescuentoGlobal, calcularTotal,
    impuestoPrincipal
  } = useFacturacion()

  if (loading && productos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="spinner mb-4" />
        <p className="text-neutro-600">Abriendo el catálogo…</p>
      </div>
    )
  }

  const facturando = tabActiva === 'nueva' && clienteSeleccionado
  const hayLineas = items.length > 0

  return (
    /* El espacio de abajo deja lugar a la barra de cobro fija, que solo
       existe cuando hay algo que cobrar y por debajo de `lg`. */
    <div className={`mx-auto max-w-6xl ${facturando && hayLineas ? 'pb-32 lg:pb-6' : 'pb-6'}`}>
      <CabeceraFacturacion
        isOnline={isOnline}
        facturasPendientesCount={facturasPendientes.length}
        syncingCache={syncingCache}
        onActualizarCache={actualizarCache}
      />

      <AvisoFlotante mensaje={mensaje} />

      {mostrarRecordatorioActualizacion && (
        <AvisoActualizar
          isOnline={isOnline}
          syncingCache={syncingCache}
          onActualizarCache={actualizarCache}
          onOcultar={ocultarRecordatorioActualizacion}
        />
      )}

      <PestanasFacturacion
        tabActiva={tabActiva}
        onCambiarTab={cambiarTab}
        modoEdicion={modoEdicion}
        edicionesPendientesCount={edicionesPendientes.length}
      />

      {tabActiva === 'editar' && (
        <PanelEditarFacturas
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

      {tabActiva === 'nueva' && (
        <>
          {modoEdicion && facturaEditando && (
            <AvisoEdicion facturaEditando={facturaEditando} onCancelar={limpiarFactura} />
          )}

          {!clienteSeleccionado ? (
            <>
              {cacheStats && <EstadoCatalogo cacheStats={cacheStats} />}
              <PasoCliente
                cardRef={clienteCardRef}
                busquedaCliente={busquedaCliente}
                onBusquedaClienteChange={cambiarBusquedaCliente}
                onFocusBusqueda={focusBusquedaCliente}
                onLimpiarBusqueda={limpiarBusquedaCliente}
                clientesEncontrados={clientesEncontrados}
                onSeleccionarCliente={seleccionarCliente}
              />
            </>
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-3 lg:gap-6">
              <div className="flex flex-col gap-4 lg:col-span-2">
                <TarjetaCliente cliente={clienteSeleccionado} onCambiarCliente={deseleccionarCliente} />

                <AgregarProductos
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

                {hayLineas ? (
                  <section className="card rounded-2xl p-4 md:p-5">
                    <h3 className="mb-3 flex items-center gap-2 font-bold text-neutro-900">
                      <ShoppingCart size={20} className="text-primario-600" />
                      En la factura
                      <span className="rounded-full bg-neutro-100 px-2 py-0.5 text-xs font-bold text-neutro-600">
                        {items.length}
                      </span>
                    </h3>
                    <div className="flex flex-col gap-3">
                      {items.map((item, index) => (
                        <LineaFactura
                          key={item.id}
                          item={item}
                          index={index}
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
                    </div>
                  </section>
                ) : (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutro-300 px-6 py-10 text-center">
                    <PackageOpen size={32} className="text-neutro-300" />
                    <p className="font-semibold text-neutro-700">La factura está vacía</p>
                    <p className="text-sm text-neutro-500">Agregá el primer producto para ver el total.</p>
                  </div>
                )}
              </div>

              {hayLineas && (
                <PanelCobro
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
              )}
            </div>
          )}
        </>
      )}

      {modalCantidadProducto && productoSeleccionadoCantidad && (
        <ModalCantidad
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
