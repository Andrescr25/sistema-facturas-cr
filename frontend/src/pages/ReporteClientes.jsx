import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useReporteClientes } from '../hooks/useReporteClientes'
import ListaClientes from '../components/reporte-clientes/ListaClientes'
import ClienteDetalle from '../components/reporte-clientes/ClienteDetalle'
import ConfirmModal from '../components/ConfirmModal'
import ToastContainer from '../components/ToastContainer'
import { FILTROS_VACIOS } from '../utils/reporteClientesUtils'

export default function ReporteClientes() {
  const {
    clientes,
    resumen,
    loading,
    error,
    entregasAjustadas,
    facturasEstado,
    loadReporte,
    handleFacturaLista,
    handleRecuperarFactura,
    handleCantidadEntregadaChange,
    handleMarcarCompleto,
    handleDeshacer,
    handleNoLlegoNada,
    handleMarcarRevisado,
    handleMarcarFacturaRevisada,
    handleReabrirRevision,
    handleQuitarRespuesta,
    contarAjustes,
    dialogProps,
    toasts,
    removeToast
  } = useReporteClientes()

  // NAVEGACIÓN: lista de clientes → detalle de cliente
  const [clienteActivoNombre, setClienteActivoNombre] = useState(null)
  // Los filtros de la lista viven ACÁ y no en la lista: la lista se desmonta
  // al entrar a un cliente, y al volver los filtros aparecían vacíos.
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)

  if (loading && !clientes.length) {
    return (
      <div className="max-w-[1400px] mx-auto text-center py-12">
        <div className="spinner mx-auto mb-4 border-t-2 border-b-2 border-nota-500 rounded-full w-12 h-12 animate-spin"></div>
        <p className="text-neutro-600">Cargando reporte de clientes...</p>
      </div>
    )
  }

  const clienteActivo = clientes.find(c => c.nombre === clienteActivoNombre)

  return (
    <div className="max-w-[1400px] mx-auto pb-24">
      <div className="mb-8 pl-1">
        <h1 className="text-4xl font-extrabold text-neutro-900 tracking-tight">Faltantes por Cliente</h1>
        <p className="text-neutro-500 mt-2 text-lg">Ajusta entregas, procesa facturas y controla el estado de los pedidos.</p>
      </div>

      {error && (
        <div className="bg-peligro-50 border-l-4 border-peligro-500 p-4 mb-8 rounded shadow-sm">
          <div className="flex items-center"><AlertCircle className="text-peligro-500 mr-2" /><p className="text-peligro-700 font-medium">Error: {error}</p></div>
        </div>
      )}

      {!clienteActivo ? (
        <ListaClientes
          clientes={clientes}
          resumen={resumen}
          facturasEstado={facturasEstado}
          entregasAjustadas={entregasAjustadas}
          contarAjustes={contarAjustes}
          filtros={filtros}
          onFiltrosChange={setFiltros}
          onSelectCliente={setClienteActivoNombre}
          onRefresh={loadReporte}
        />
      ) : (
        <ClienteDetalle
          cliente={clienteActivo}
          facturasEstado={facturasEstado}
          entregasAjustadas={entregasAjustadas}
          onVolver={() => setClienteActivoNombre(null)}
          onFacturaLista={handleFacturaLista}
          onRecuperarFactura={handleRecuperarFactura}
          onCantidadEntregadaChange={handleCantidadEntregadaChange}
          onMarcarCompleto={handleMarcarCompleto}
          onNoLlegoNada={handleNoLlegoNada}
          onDeshacer={handleDeshacer}
          onMarcarRevisado={handleMarcarRevisado}
          onMarcarFacturaRevisada={handleMarcarFacturaRevisada}
          onReabrirRevision={handleReabrirRevision}
          onQuitarRespuesta={handleQuitarRespuesta}
        />
      )}

      <ConfirmModal {...dialogProps} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
