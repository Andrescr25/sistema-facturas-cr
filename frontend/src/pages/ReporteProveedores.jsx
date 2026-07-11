import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
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
    removeToast
  } = useReporteProveedores()

  // NAVEGACIÓN: lista de proveedores → detalle de proveedor
  const [proveedorActivoId, setProveedorActivoId] = useState(null)

  if (loading && !proveedores.length) {
    return (
      <div className="max-w-6xl mx-auto text-center py-12">
        <div className="spinner mx-auto mb-4 border-t-2 border-b-2 border-blue-500 rounded-full w-12 h-12 animate-spin"></div>
        <p className="text-gray-600">Cargando reporte de proveedores...</p>
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
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Faltantes y Compras</h1>
        <p className="text-gray-500 mt-2 text-lg">Central de proveedores, análisis predictivos y órdenes automáticas.</p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded shadow-sm">
          <div className="flex items-center"><AlertCircle className="text-red-500 mr-2" /><p className="text-red-700 font-medium">Error: {error}</p></div>
        </div>
      )}

      {/* Manejo de Vistas (Listado vs Panel Detalle) */}
      {!proveedorActivoId ? (
        <ListaProveedores
          proveedores={proveedores}
          resumen={resumen}
          fechaInicio={fechaInicio}
          setFechaInicio={setFechaInicio}
          onRefresh={loadReporte}
          onSelectProveedor={setProveedorActivoId}
        />
      ) : proveedorActivo ? (
        <ProveedorDetalle
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
      ) : null}

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
