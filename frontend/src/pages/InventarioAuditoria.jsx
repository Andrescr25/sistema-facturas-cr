import { Boxes, Search, ArrowLeft, RefreshCw, Plus } from 'lucide-react'
import { useInventarioAuditoria } from '../hooks/useInventarioAuditoria'
import { formatCurrency, formatDate, tamanoTextoMonto } from '../utils/inventarioAuditoriaUtils'
import ToastContainer from '../components/ToastContainer'
import ConfirmModal from '../components/ConfirmModal'
import DashboardKpis from '../components/inventario-auditoria/DashboardKpis'
import ControlExistencias from '../components/inventario-auditoria/ControlExistencias'
import HistorialAuditorias from '../components/inventario-auditoria/HistorialAuditorias'
import ModalNuevaAuditoria from '../components/inventario-auditoria/ModalNuevaAuditoria'
import AuditoriaExpirada from '../components/inventario-auditoria/AuditoriaExpirada'
import FiltrosEjecucion from '../components/inventario-auditoria/FiltrosEjecucion'
import ItemAuditoriaCard from '../components/inventario-auditoria/ItemAuditoriaCard'
import ModalImagenProducto from '../components/inventario-auditoria/ModalImagenProducto'
import PanelProgresoConteo from '../components/inventario-auditoria/PanelProgresoConteo'
import ReporteFinalizado from '../components/inventario-auditoria/ReporteFinalizado'
import BarraAccionMovil from '../components/inventario-auditoria/BarraAccionMovil'
import TabsInventarioAuditoria from '../components/inventario-auditoria/TabsInventarioAuditoria'
import ModalNuevaDevolucion from '../components/inventario-auditoria/ModalNuevaDevolucion'
import HistorialDevoluciones from '../components/inventario-auditoria/HistorialDevoluciones'
import BuscadorProductoDevolucion from '../components/inventario-auditoria/BuscadorProductoDevolucion'
import ListaItemsDevolucion from '../components/inventario-auditoria/ListaItemsDevolucion'
import PanelFinalizarDevolucion from '../components/inventario-auditoria/PanelFinalizarDevolucion'

export default function InventarioAuditoria() {
  const {
    auditorias,
    categorias,
    loading,
    error,
    showHistory,
    setShowHistory,
    loadDashboard,
    kpis,

    vistaActiva,
    cambiarVista,
    devoluciones,
    loadDevoluciones,
    showNewDevolucionModal,
    setShowNewDevolucionModal,
    siguienteNombreDevolucion,
    handleCreateDevolucion,
    busquedaProductoDevolucion,
    setBusquedaProductoDevolucion,
    resultadosProductoDevolucion,
    buscandoProductoDevolucion,
    agregandoItemDevolucion,
    handleAgregarItemDevolucion,
    handleEliminarItemDevolucion,
    handleFinalizeDevolucion,

    auditoriaActiva,
    conteosDraft,
    observacionesFinales,
    setObservacionesFinales,
    handleSelectAuditoria,
    volverAlDashboard,

    showNewModal,
    setShowNewModal,
    newAuditTipo,
    setNewAuditTipo,
    newAuditCategoria,
    setNewAuditCategoria,
    newAuditNombre,
    setNewAuditNombre,
    handleCreateAudit,

    executionSearch,
    setExecutionSearch,
    executionFilter,
    setExecutionFilter,

    loadingAjuste,
    successAjuste,
    applyingAdjustments,

    handleSaveDraft,
    handleResyncAuditoria,
    handleFinalize,
    handleApplyAlegraAdjustment,
    handleConteoChange,
    imagenProductoActivo,
    handleVerImagenProducto,
    handleCerrarImagenProducto,

    filteredItems,
    itemsStats,
    adjustmentsPreview,
    liveFinancialImpact,

    toasts,
    removeToast,
    dialogProps
  } = useInventarioAuditoria()

  // Dashboard view
  if (!auditoriaActiva) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 px-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
              <Boxes className="text-emerald-600" size={32} />
              Auditoría de Inventarios
            </h1>
            <p className="text-gray-500 mt-1">
              Controla el inventario de la distribuidora mediante auditorías selectivas cíclicas de stock en tiempo real.
            </p>
          </div>
        </div>

        <TabsInventarioAuditoria vistaActiva={vistaActiva} onCambiarVista={cambiarVista} />

        {vistaActiva === 'auditorias' ? (
          <>
            <DashboardKpis kpis={kpis} />

            {/* Minimalist Control Panel or History */}
            {!showHistory ? (
              <ControlExistencias
                onNuevaAuditoria={() => setShowNewModal(true)}
                onVerHistorial={() => setShowHistory(true)}
              />
            ) : (
              <HistorialAuditorias
                auditorias={auditorias}
                loading={loading}
                onVolver={() => setShowHistory(false)}
                onRefresh={loadDashboard}
                onSelectAuditoria={handleSelectAuditoria}
              />
            )}
          </>
        ) : (
          <>
            <div className="flex justify-end">
              <button
                onClick={() => setShowNewDevolucionModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-5 rounded-2xl shadow-md transition-all flex items-center gap-2"
              >
                <Plus size={18} />
                Nueva Devolución
              </button>
            </div>

            <HistorialDevoluciones
              devoluciones={devoluciones}
              loading={loading}
              onRefresh={loadDevoluciones}
              onSelectDevolucion={handleSelectAuditoria}
            />
          </>
        )}

        {/* Modal: New Devolución */}
        {showNewDevolucionModal && (
          <ModalNuevaDevolucion
            loading={loading}
            siguienteNombre={siguienteNombreDevolucion}
            onSubmit={handleCreateDevolucion}
            onCerrar={() => setShowNewDevolucionModal(false)}
          />
        )}

        {/* Modal: New Audit */}
        {showNewModal && (
          <ModalNuevaAuditoria
            loading={loading}
            newAuditNombre={newAuditNombre}
            setNewAuditNombre={setNewAuditNombre}
            newAuditTipo={newAuditTipo}
            setNewAuditTipo={setNewAuditTipo}
            newAuditCategoria={newAuditCategoria}
            setNewAuditCategoria={setNewAuditCategoria}
            categorias={categorias}
            onSubmit={handleCreateAudit}
            onCerrar={() => setShowNewModal(false)}
          />
        )}

        <ConfirmModal {...dialogProps} />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
    )
  }

  // Active Audit / Devolución Screen
  const esActiva = auditoriaActiva.estado === 'en_progreso'
  const esDevolucion = auditoriaActiva.tipo === 'devolucion'

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-4 pb-28 sm:pb-20">
      {/* Header back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={volverAlDashboard}
          className="flex items-center gap-2 text-gray-500 hover:text-emerald-600 font-bold transition-colors"
        >
          <ArrowLeft size={20} />
          {esDevolucion ? 'Volver a devoluciones' : 'Volver a auditorías'}
        </button>
        <span className={`inline-flex items-center gap-1 font-bold text-xs px-3 py-1 rounded-full uppercase tracking-wider ${esActiva ? 'bg-yellow-50 text-yellow-700 border border-yellow-150' : 'bg-green-50 text-green-700 border border-green-150'}`}>
          {esActiva ? 'En Progreso' : 'Finalizada'}
        </span>
      </div>

      {auditoriaActiva.expirada ? (
        <AuditoriaExpirada
          loading={loading}
          onResync={handleResyncAuditoria}
          onVolver={volverAlDashboard}
        />
      ) : (
        <>
          {/* Audit Identity Card */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">{auditoriaActiva.nombre}</h1>
              <p className="text-sm text-gray-500 flex items-center gap-3">
                <span>Tipo: <strong className="text-gray-700 capitalize">
                  {esDevolucion ? 'Devolución' : auditoriaActiva.tipo === 'random' ? 'Aleatoria 50' : auditoriaActiva.tipo === 'categoria' ? 'Categoría' : 'Crítica'}
                </strong></span>
                <span>•</span>
                <span>Creada: <strong className="text-gray-700">{formatDate(auditoriaActiva.fecha_creacion)}</strong></span>
              </p>
            </div>

            {!esActiva && !esDevolucion && (
              <div className="flex flex-wrap items-center gap-6 border-t md:border-t-0 pt-4 md:pt-0">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Precisión</p>
                  <h4 className="text-2xl font-extrabold text-gray-900">{Number(auditoriaActiva.precision_porcentaje).toFixed(1)}%</h4>
                </div>
                <div className="border-l pl-6 min-w-0">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Descuadre Monetario</p>
                  <h4 className={`font-extrabold break-words ${tamanoTextoMonto(formatCurrency(auditoriaActiva.descuadre_dinero))} ${Number(auditoriaActiva.descuadre_dinero) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatCurrency(auditoriaActiva.descuadre_dinero)}
                  </h4>
                </div>
              </div>
            )}
          </div>

          {/* Execution filters (solo auditorías, no devoluciones) */}
          {esActiva && !esDevolucion && (
            <FiltrosEjecucion
              executionSearch={executionSearch}
              setExecutionSearch={setExecutionSearch}
              executionFilter={executionFilter}
              setExecutionFilter={setExecutionFilter}
              itemsStats={itemsStats}
            />
          )}

          {/* Main Grid: Products execution or report details */}
          {esActiva && esDevolucion ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div className="md:col-span-2 space-y-4">
                <BuscadorProductoDevolucion
                  busqueda={busquedaProductoDevolucion}
                  setBusqueda={setBusquedaProductoDevolucion}
                  resultados={resultadosProductoDevolucion}
                  buscando={buscandoProductoDevolucion}
                  agregando={agregandoItemDevolucion}
                  onAgregar={handleAgregarItemDevolucion}
                />
                <ListaItemsDevolucion
                  items={auditoriaActiva.items}
                  onQuitar={handleEliminarItemDevolucion}
                />
              </div>

              <div className="space-y-6">
                <PanelFinalizarDevolucion
                  itemsStats={itemsStats}
                  liveFinancialImpact={liveFinancialImpact}
                  observacionesFinales={observacionesFinales}
                  setObservacionesFinales={setObservacionesFinales}
                  loading={loading}
                  onFinalizar={handleFinalizeDevolucion}
                />
              </div>
            </div>
          ) : esActiva ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              {/* Left / Middle: Products counting sheet */}
              <div className="md:col-span-2 space-y-4">
                <h3 className="text-lg font-bold text-gray-900">Hoja de Conteo Físico ({filteredItems.length} mostrados)</h3>

                {filteredItems.length === 0 ? (
                  <div className="bg-white p-12 text-center text-gray-400 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-3">
                    <Search size={32} className="text-gray-300" />
                    <span>No se encontraron productos con los filtros aplicados.</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredItems.map(item => (
                      <ItemAuditoriaCard
                        key={item.id}
                        item={item}
                        conteoRaw={conteosDraft[item.id]}
                        onConteoChange={handleConteoChange}
                        onVerImagen={handleVerImagenProducto}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Auditor summary action pane */}
              <div className="space-y-6">
                <PanelProgresoConteo
                  itemsStats={itemsStats}
                  liveFinancialImpact={liveFinancialImpact}
                  observacionesFinales={observacionesFinales}
                  setObservacionesFinales={setObservacionesFinales}
                  loading={loading}
                  onGuardar={handleSaveDraft}
                  onFinalizar={handleFinalize}
                />
              </div>
            </div>
          ) : (
            <ReporteFinalizado
              auditoriaActiva={auditoriaActiva}
              adjustmentsPreview={adjustmentsPreview}
              loadingAjuste={loadingAjuste}
              successAjuste={successAjuste}
              error={error}
              onAplicarAjuste={handleApplyAlegraAdjustment}
              esDevolucion={esDevolucion}
            />
          )}

          {/* Mobile Floating Action Summary Bar (Sticky at the bottom of the viewport) — solo auditorías */}
          {esActiva && !esDevolucion && (
            <BarraAccionMovil
              itemsStats={itemsStats}
              liveFinancialImpact={liveFinancialImpact}
              loading={loading}
              onGuardar={handleSaveDraft}
              onFinalizar={handleFinalize}
            />
          )}
        </>
      )}

      {/* Overlay: aplicando ajustes de inventario en Alegra (puede tardar varios segundos por el loteo) */}
      {applyingAdjustments && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75" />
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 text-center border border-gray-150">
            <RefreshCw className="animate-spin text-emerald-600 mx-auto" size={32} />
            <div>
              <p className="font-bold text-gray-900">Aplicando ajustes de inventario en Alegra</p>
              <p className="text-xs text-gray-500 mt-1">Esto puede tardar varios segundos. No cierres esta ventana.</p>
            </div>
            <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden relative">
              <div className="absolute h-full w-2/5 bg-emerald-600 rounded-full animate-indeterminate-bar" />
            </div>
          </div>
        </div>
      )}

      {imagenProductoActivo && (
        <ModalImagenProducto
          item={imagenProductoActivo}
          onCerrar={handleCerrarImagenProducto}
        />
      )}

      <ConfirmModal {...dialogProps} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
