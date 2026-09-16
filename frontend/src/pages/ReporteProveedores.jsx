import { useState, useEffect } from 'react'
import { AlertCircle, Package } from 'lucide-react'
import { useReporteProveedores } from '../hooks/useReporteProveedores'
import ListaProveedores from '../components/reporte-proveedores/ListaProveedores'
import ProveedorDetalle from '../components/reporte-proveedores/ProveedorDetalle'
import ModalAsignarProveedor from '../components/reporte-proveedores/ModalAsignarProveedor'
import ModalCrearProveedor from '../components/reporte-proveedores/ModalCrearProveedor'
import ModalAgregarProducto from '../components/reporte-proveedores/ModalAgregarProducto'
import ModalWhatsApp from '../components/reporte-proveedores/ModalWhatsApp'
import ConfirmModal from '../components/ConfirmModal'
import ToastContainer from '../components/ToastContainer'

export default function ReporteProveedores() {
  const {
    proveedores,
    notasPorProducto,
    cargandoNotas,
    pedidosEnviados,
    resumen,
    loading,
    error,
    fechaInicio,
    setFechaInicio,
    loadReporte,

    cantidadesModificadas,
    cantidadesGuardadas,
    handleCantidadChange,
    handleGuardarCantidades,

    preferenciasDatosProveedor,
    togglePreferenciaProveedor,

    handleGenerarPDF,

    modalWhatsAppVisible,
    setModalWhatsAppVisible,
    telefonoProveedor,
    setTelefonoProveedor,
    mensajeWhatsApp,
    setMensajeWhatsApp,
    abrirModalWhatsApp,
    enviarWhatsApp,

    productosSeleccionados,
    toggleProductoSeleccionado,
    toggleTodosProductos,

    modalAsignarVisible,
    setModalAsignarVisible,
    proveedoresAlegra,
    setProveedoresAlegra,
    busquedaProveedor,
    setBusquedaProveedor,
    loadingProveedores,
    abrirModalAsignar,
    cargarProveedoresAlegra,
    asignarProveedorManual,

    modalCrearProveedor,
    setModalCrearProveedor,
    crearNuevoProveedor,

    productosEliminados,
    eliminarProductoDeOrden,
    restaurarProducto,

    productosAgregados,
    modalAgregarProducto,
    setModalAgregarProducto,
    proveedorParaAgregar,
    busquedaProducto,
    setBusquedaProducto,
    productosAlegra,
    loadingProductos,
    abrirModalAgregarProducto,
    buscarProductosAlegra,
    solicitarCantidadYAgregar,
    eliminarProductoAgregado,
    actualizarCantidadAgregado,

    dialogProps,
    toasts,
    showToast,
    removeToast
  } = useReporteProveedores()

  // NAVEGACIÓN: lista de proveedores → detalle de proveedor
  const [proveedorActivoId, setProveedorActivoId] = useState(null)

  /**
   * Si el proveedor que se está viendo desaparece del reporte, se vuelve a
   * la lista.
   *
   * EL BUG QUE ARREGLA
   * `loadReporte` deja fuera a los proveedores que se quedaron sin productos
   * faltantes. Al pasar TODOS los productos de un proveedor a otro, ese
   * proveedor salía de la lista pero `proveedorActivoId` seguía apuntándole:
   * la página no encontraba el proveedor, caía en la rama `null` y quedaba
   * en blanco, sin botón de volver ni forma de salir que no fuera recargar.
   *
   * Se avisa por qué, porque irse solo de una pantalla también desconcierta
   * si no se explica.
   */
  useEffect(() => {
    if (!proveedorActivoId || loading) return
    if (proveedores.some(p => p.id === proveedorActivoId)) return

    setProveedorActivoId(null)
    showToast('Ese proveedor ya no tiene productos pendientes.', 'info')
  }, [proveedorActivoId, proveedores, loading, showToast])

  if (loading && !proveedores.length) {
    return (
      <div className="max-w-6xl mx-auto text-center py-12">
        <div className="spinner mx-auto mb-4 border-t-2 border-b-2 border-primario-500 rounded-full w-12 h-12 animate-spin"></div>
        <p className="text-neutro-600">Cargando reporte de proveedores...</p>
      </div>
    )
  }

  const proveedorActivo = proveedores.find(p => p.id === proveedorActivoId)

  const cerrarModalAsignar = () => {
    setModalAsignarVisible(false)
    setBusquedaProveedor('')
    setProveedoresAlegra([])
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-24">
      <div className="mb-8 pl-1">
        <h1 className="text-4xl font-extrabold text-neutro-900 tracking-tight">Faltantes y Compras</h1>
        <p className="text-neutro-500 mt-2 text-lg">Central de proveedores, análisis predictivos y órdenes automáticas.</p>
      </div>

      {error && (
        <div className="bg-peligro-50 border-l-4 border-peligro-500 p-4 mb-8 rounded shadow-sm">
          <div className="flex items-center"><AlertCircle className="text-peligro-500 mr-2" /><p className="text-peligro-700 font-medium">Error: {error}</p></div>
        </div>
      )}

      {/* Manejo de Vistas (Listado vs Panel Detalle) */}
      {!proveedorActivoId ? (
        <ListaProveedores
          proveedores={proveedores}
          pedidosEnviados={pedidosEnviados}
          resumen={resumen}
          fechaInicio={fechaInicio}
          setFechaInicio={setFechaInicio}
          onRefresh={loadReporte}
          onSelectProveedor={setProveedorActivoId}
        />
      ) : proveedorActivo ? (
        <ProveedorDetalle
          notasPorProducto={notasPorProducto}
          cargandoNotas={cargandoNotas}
          proveedor={proveedorActivo}
          onVolver={() => setProveedorActivoId(null)}
          cantidadesModificadas={cantidadesModificadas}
          cantidadesGuardadas={cantidadesGuardadas}
          handleGuardarCantidades={handleGuardarCantidades}
          handleCantidadChange={handleCantidadChange}
          handleGenerarPDF={handleGenerarPDF}
          preferenciasDatosProveedor={preferenciasDatosProveedor}
          togglePreferenciaProveedor={togglePreferenciaProveedor}
          productosSeleccionados={productosSeleccionados}
          toggleProductoSeleccionado={toggleProductoSeleccionado}
          toggleTodosProductos={toggleTodosProductos}
          productosEliminados={productosEliminados}
          eliminarProductoDeOrden={eliminarProductoDeOrden}
          restaurarProducto={restaurarProducto}
          productosAgregados={productosAgregados}
          actualizarCantidadAgregado={actualizarCantidadAgregado}
          eliminarProductoAgregado={eliminarProductoAgregado}
          onAgregarProducto={abrirModalAgregarProducto}
          onAbrirWhatsApp={abrirModalWhatsApp}
          onAbrirModalAsignar={abrirModalAsignar}
        />
      ) : (
        /* Red de seguridad. El efecto de arriba ya devuelve a la lista sola,
           pero mientras el reporte recarga puede haber un momento en que el
           proveedor abierto no esté en la lista todavía. Antes acá iba
           `null` —pantalla en blanco, sin salida— y ese era justamente el
           bug. Ahora siempre hay un botón de volver. */
        <div className="card flex flex-col items-center gap-3 py-16 text-center">
          <Package size={40} className="text-neutro-300" />
          <p className="font-semibold text-neutro-700">Este proveedor ya no tiene productos pendientes</p>
          <p className="text-sm text-neutro-500">Seguramente se pasaron todos a otro proveedor.</p>
          <button onClick={() => setProveedorActivoId(null)} className="btn btn-primary mt-2">
            Volver a proveedores
          </button>
        </div>
      )}

      {modalAsignarVisible && (
        <ModalAsignarProveedor
          cantidadSeleccionados={productosSeleccionados.size}
          busquedaProveedor={busquedaProveedor}
          setBusquedaProveedor={setBusquedaProveedor}
          proveedoresAlegra={proveedoresAlegra}
          loadingProveedores={loadingProveedores}
          onBuscar={cargarProveedoresAlegra}
          onAsignar={asignarProveedorManual}
          onCrearNuevo={() => setModalCrearProveedor(true)}
          onCerrar={cerrarModalAsignar}
        />
      )}

      {modalCrearProveedor && (
        <ModalCrearProveedor
          loading={loading}
          onCrear={crearNuevoProveedor}
          onCerrar={() => setModalCrearProveedor(false)}
        />
      )}

      {modalAgregarProducto && proveedorParaAgregar && (
        <ModalAgregarProducto
          proveedor={proveedorParaAgregar}
          busquedaProducto={busquedaProducto}
          setBusquedaProducto={setBusquedaProducto}
          productosAlegra={productosAlegra}
          loadingProductos={loadingProductos}
          onBuscar={buscarProductosAlegra}
          onAgregarConCantidad={solicitarCantidadYAgregar}
          onCerrar={() => setModalAgregarProducto(false)}
        />
      )}

      {modalWhatsAppVisible && (
        <ModalWhatsApp
          telefonoProveedor={telefonoProveedor}
          setTelefonoProveedor={setTelefonoProveedor}
          mensajeWhatsApp={mensajeWhatsApp}
          setMensajeWhatsApp={setMensajeWhatsApp}
          loading={loading}
          onEnviar={enviarWhatsApp}
          onCerrar={() => setModalWhatsAppVisible(false)}
        />
      )}

      <ConfirmModal {...dialogProps} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
