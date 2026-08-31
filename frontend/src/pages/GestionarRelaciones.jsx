import { Link2, RefreshCw, AlertCircle } from 'lucide-react'
import { useGestionarRelaciones } from '../hooks/useGestionarRelaciones'
import FiltrosRelaciones from '../components/gestionar-relaciones/FiltrosRelaciones'
import ListaProductosRelacionados from '../components/gestionar-relaciones/ListaProductosRelacionados'
import ModalEditarRelacion from '../components/gestionar-relaciones/ModalEditarRelacion'
import ModalFactorConversion from '../components/gestionar-relaciones/ModalFactorConversion'
import ModalEliminarRelacion from '../components/gestionar-relaciones/ModalEliminarRelacion'
import ModalVerRelaciones from '../components/gestionar-relaciones/ModalVerRelaciones'
import ToastContainer from '../components/ToastContainer'

export default function GestionarRelaciones() {
  const {
    productos,
    loading,
    error,
    filtroProveedor,
    setFiltroProveedor,
    busqueda,
    setBusqueda,
    proveedores,
    page,
    setPage,
    totalPages,
    total,
    loadProductos,
    aplicarFiltros,
    limpiarFiltros,

    modalEditar,
    abrirEditar,
    cerrarEditar,

    modalFactor,
    abrirFactor,
    cerrarFactor,
    cantidadProveedor,
    setCantidadProveedor,
    cantidadMia,
    setCantidadMia,
    guardarFactor,

    modalRelaciones,
    abrirRelaciones,
    cerrarRelaciones,
    relacionesProducto,
    cargandoRelaciones,

    modalEliminar,
    abrirEliminar,
    cerrarEliminar,
    confirmarEliminacion,

    productoSeleccionado,
    terminoBusqueda,
    setTerminoBusqueda,
    resultadosBusqueda,
    buscando,
    cambiarRelacion,

    toasts,
    removeToast
  } = useGestionarRelaciones()

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-neutro-900 flex items-center gap-2.5">
            <Link2 className="text-nota-600" size={28} />
            Gestionar Relaciones
          </h1>
          <p className="text-sm text-neutro-500 mt-0.5">
            Consulta, edita o elimina las relaciones establecidas entre productos de proveedores y tu catálogo de Alegra.
          </p>
        </div>
        <button
          onClick={loadProductos}
          disabled={loading}
          className="px-4 py-2 border border-neutro-200 hover:bg-neutro-50 text-neutro-700 text-sm font-semibold rounded-xl transition flex items-center gap-1.5"
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} size={16} />
          Actualizar
        </button>
      </div>

      {/* Estadísticas Simplificadas */}
      <div className="bg-primario-50/50 border border-primario-100 p-5 rounded-3xl max-w-sm shadow-xxs">
        <p className="text-xs font-semibold text-primario-600 uppercase tracking-wider mb-1">Total Relaciones Establecidas</p>
        <p className="text-3xl font-black text-primario-900">{total}</p>
      </div>

      <FiltrosRelaciones
        filtroProveedor={filtroProveedor}
        setFiltroProveedor={setFiltroProveedor}
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        proveedores={proveedores}
        onBuscar={aplicarFiltros}
        onLimpiar={limpiarFiltros}
      />

      {error && (
        <div className="card bg-peligro-50 border-peligro-200 mb-6">
          <div className="flex items-center">
            <AlertCircle className="text-peligro-500 mr-2" size={20} />
            <p className="text-peligro-700">Error: {error}</p>
          </div>
        </div>
      )}

      <ListaProductosRelacionados
        productos={productos}
        loading={loading}
        page={page}
        totalPages={totalPages}
        setPage={setPage}
        onVerRelaciones={abrirRelaciones}
        onEditar={abrirEditar}
        onFactor={abrirFactor}
        onEliminar={abrirEliminar}
      />

      {modalEditar && productoSeleccionado && (
        <ModalEditarRelacion
          producto={productoSeleccionado}
          terminoBusqueda={terminoBusqueda}
          setTerminoBusqueda={setTerminoBusqueda}
          resultadosBusqueda={resultadosBusqueda}
          buscando={buscando}
          onCambiarRelacion={cambiarRelacion}
          onCerrar={cerrarEditar}
        />
      )}

      {modalFactor && productoSeleccionado && (
        <ModalFactorConversion
          producto={productoSeleccionado}
          cantidadProveedor={cantidadProveedor}
          setCantidadProveedor={setCantidadProveedor}
          cantidadMia={cantidadMia}
          setCantidadMia={setCantidadMia}
          onGuardar={guardarFactor}
          onCerrar={cerrarFactor}
        />
      )}

      {modalEliminar && productoSeleccionado && (
        <ModalEliminarRelacion
          producto={productoSeleccionado}
          onConfirmar={confirmarEliminacion}
          onCerrar={cerrarEliminar}
        />
      )}

      {modalRelaciones && productoSeleccionado && (
        <ModalVerRelaciones
          producto={productoSeleccionado}
          relaciones={relacionesProducto}
          cargando={cargandoRelaciones}
          onCerrar={cerrarRelaciones}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
