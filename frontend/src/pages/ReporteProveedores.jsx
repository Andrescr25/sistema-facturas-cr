import FiltroCicloOperacion from '../components/FiltroCicloOperacion'
import FaltantesPorCiclo from '../components/reporte-proveedores/FaltantesPorCiclo'
import OrdenesCompraCiclo from '../components/reporte-proveedores/OrdenesCompraCiclo'
import NecesidadesPorCiclo from '../components/reporte-proveedores/NecesidadesPorCiclo'
import { useState, useEffect } from 'react'
import { AlertCircle, Package, ClipboardList, Contact } from 'lucide-react'
import { useReporteProveedores } from '../hooks/useReporteProveedores'
import { useFichasProveedor } from '../hooks/useFichasProveedor'
import { useDialog } from '../hooks/useDialog'
import ListaFichasProveedor from '../components/reporte-proveedores/ListaFichasProveedor'
import ModalFichaProveedor from '../components/reporte-proveedores/ModalFichaProveedor'
import ListaProveedores from '../components/reporte-proveedores/ListaProveedores'
import ProveedorDetalle from '../components/reporte-proveedores/ProveedorDetalle'
import ModalAsignarProveedor from '../components/reporte-proveedores/ModalAsignarProveedor'
import ModalCrearProveedor from '../components/reporte-proveedores/ModalCrearProveedor'
import ModalAgregarProducto from '../components/reporte-proveedores/ModalAgregarProducto'
import ConfirmModal from '../components/ConfirmModal'
import ToastContainer from '../components/ToastContainer'
import BotonExportarExcel from '../components/ui/BotonExportarExcel'

export default function ReporteProveedores() {
  const [vista, setVista] = useState('necesidades')
  const {
    filtroCiclo, consultaCiclo,
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

    productosSeleccionados,
    toggleProductoSeleccionado,
    toggleTodosProductos,

    modalAsignarVisible,
    setModalAsignarVisible,
    proveedoresDisponibles,
    setProveedoresDisponibles,
    busquedaProveedor,
    setBusquedaProveedor,
    loadingProveedores,
    abrirModalAsignar,
    cargarProveedores,
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
    productosEncontrados,
    loadingProductos,
    abrirModalAgregarProducto,
    buscarProductos,
    solicitarCantidadYAgregar,
    eliminarProductoAgregado,
    actualizarCantidadAgregado,

    dialogProps,
    toasts,
    showToast,
    removeToast
  } = useReporteProveedores({activo:vista==='faltantes'})

  // NAVEGACIÓN: lista de proveedores → detalle de proveedor
  const [proveedorActivoId, setProveedorActivoId] = useState(null)
  const [proveedorQuery, setProveedorQuery] = useState('')

  // Dos vistas: los faltantes de siempre y las FICHAS (quién es cada
  // proveedor), que antes no se podían ver ni corregir desde el sistema.
  const [proveedorOrden, setProveedorOrden] = useState(null)
  // Diálogo propio: el del reporte lo maneja useReporteProveedores por dentro
  // y no expone `confirm`.
  const { confirm: confirmarFicha, dialogProps: dialogFichas } = useDialog()
  const fichas = useFichasProveedor({ showToast, confirm: confirmarFicha })

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
  useEffect(() => { setProveedorActivoId(null) }, [filtroCiclo.rutaId, filtroCiclo.cicloId, fechaInicio])

  useEffect(() => {
    if (!proveedorActivoId || loading) return
    if (proveedores.some(p => p.id === proveedorActivoId)) return

    setProveedorActivoId(null)
    showToast('Ese proveedor ya no tiene productos pendientes.', 'info')
  }, [proveedorActivoId, proveedores, loading, showToast])

  // El reporte de faltantes tarda; las fichas no dependen de él. Si esta
  // espera tapara toda la página, entrar a corregir un proveedor obligaría a
  // esperar un reporte que no se va a mirar.
  const proveedorActivo = proveedores.find(p => p.id === proveedorActivoId)

  const cerrarModalAsignar = () => {
    setModalAsignarVisible(false)
    setBusquedaProveedor('')
    setProveedoresDisponibles([])
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-24">
      <div className="mb-8 pl-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
        <h1 className="text-4xl font-extrabold text-neutro-900 tracking-tight">Faltantes y Compras</h1>
        <p className="text-neutro-500 mt-2 text-lg">Faltantes registrados y su origen por ruta y semana.</p>
        </div>
        {vista === 'faltantes' && <BotonExportarExcel ruta="/reportes/faltantes/proveedor/exportar"
          params={{ ...filtroCiclo.params, fecha_inicio: fechaInicio, buscar: proveedorActivoId ? '' : proveedorQuery, proveedor: proveedorActivoId || '' }}
          disabled={loading || Boolean(error)} title="Descarga los faltantes registrados; las cantidades de la orden se consultan en su PDF." />}
      </div>

      {vista !== 'fichas' && <FiltroCicloOperacion filtro={filtroCiclo} requiereCiclo={vista==='necesidades'} />}
      {vista === 'faltantes' && loading && <p role="status" className="mb-4 text-neutro-500">Consultando faltantes de la ruta y semana…</p>}
      {vista==='faltantes' && error && (
        <div className="bg-peligro-50 border-l-4 border-peligro-500 p-4 mb-8 rounded shadow-sm">
          <div className="flex items-center"><AlertCircle className="text-peligro-500 mr-2" /><p className="text-peligro-700 font-medium">Error: {error}</p></div>
          <button type="button" className="mt-2 min-h-11 font-bold underline" onClick={loadReporte}>Reintentar consulta</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: 'necesidades', texto: 'Necesidades y cobertura', icono: Package },
          { id: 'faltantes', texto: 'Faltantes y órdenes', icono: ClipboardList },
          { id: 'ordenes', texto: 'Órdenes por ciclo', icono: Package },
          { id: 'fichas', texto: 'Fichas', icono: Contact }
        ].map(t => {
          const Icono = t.icono
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setProveedorOrden(null); setVista(t.id) }}
              className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors ${
                vista === t.id ? 'bg-exito-600 text-white' : 'bg-white border-2 border-neutro-200 text-neutro-600'
              }`}
            >
              <Icono size={15} />
              {t.texto}
            </button>
          )
        })}
      </div>

      {/* Manejo de Vistas (Fichas · Listado de faltantes vs Panel Detalle) */}
      {vista === 'necesidades' ? <NecesidadesPorCiclo filtro={filtroCiclo} /> : vista === 'ordenes' ? <OrdenesCompraCiclo filtro={filtroCiclo} proveedorInicial={proveedorOrden} /> : vista === 'fichas' ? (
        <ListaFichasProveedor
          proveedores={fichas.proveedores}
          cargando={fichas.cargando}
          busqueda={fichas.busqueda}
          setBusqueda={fichas.setBusqueda}
          estado={fichas.estado}
          setEstado={fichas.setEstado}
          paginacion={fichas.paginacion}
          pagina={fichas.pagina}
          setPagina={fichas.setPagina}
          procesando={fichas.procesando}
          abriendo={fichas.abriendo}
          onNuevo={() => fichas.setEditando({})}
          onAbrir={fichas.abrirFicha}
          onCambiarEstado={fichas.cambiarEstado}
        />
      ) : loading || error ? null : !proveedorActivoId ? (
        <ListaProveedores
          consultaCiclo={consultaCiclo}
          proveedores={proveedores}
          pedidosEnviados={pedidosEnviados}
          resumen={resumen}
          fechaInicio={fechaInicio}
          setFechaInicio={setFechaInicio}
          onRefresh={loadReporte}
          onSelectProveedor={setProveedorActivoId}
          proveedorQuery={proveedorQuery}
          setProveedorQuery={setProveedorQuery}
        />
      ) : proveedorActivo && consultaCiclo ? (
        <FaltantesPorCiclo proveedor={proveedorActivo} cicloId={filtroCiclo.cicloId} onVolver={() => setProveedorActivoId(null)}
          notasPorProducto={notasPorProducto} cargandoNotas={cargandoNotas}
          productosSeleccionados={productosSeleccionados} onSeleccionarProducto={toggleProductoSeleccionado} onAsignar={abrirModalAsignar}
          onPrepararOrden={() => { setProveedorOrden({ cedula: proveedorActivo.cedula, nombre: proveedorActivo.nombre }); setVista('ordenes') }} />
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

      {fichas.editando && (
        <ModalFichaProveedor
          proveedor={fichas.editando.id ? fichas.editando : null}
          plazos={fichas.plazos}
          guardando={fichas.guardando}
          onGuardar={fichas.guardar}
          onCerrar={() => fichas.setEditando(null)}
        />
      )}

      <ConfirmModal {...dialogFichas} />

      {modalAsignarVisible && (
        <ModalAsignarProveedor
          cantidadSeleccionados={productosSeleccionados.size}
          soloCiclo={consultaCiclo}
          busquedaProveedor={busquedaProveedor}
          setBusquedaProveedor={setBusquedaProveedor}
          proveedoresDisponibles={proveedoresDisponibles}
          loadingProveedores={loadingProveedores}
          onBuscar={cargarProveedores}
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
          productosEncontrados={productosEncontrados}
          loadingProductos={loadingProductos}
          onBuscar={buscarProductos}
          onAgregarConCantidad={solicitarCantidadYAgregar}
          onCerrar={() => setModalAgregarProducto(false)}
        />
      )}

      <ConfirmModal {...dialogProps} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
