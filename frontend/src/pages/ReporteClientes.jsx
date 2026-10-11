import FiltroCicloOperacion from '../components/FiltroCicloOperacion'
import { useState, useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { useReporteClientes } from '../hooks/useReporteClientes'
import ListaClientes from '../components/reporte-clientes/ListaClientes'
import ClienteDetalle from '../components/reporte-clientes/ClienteDetalle'
import ConfirmModal from '../components/ConfirmModal'
import ToastContainer from '../components/ToastContainer'
import { FILTROS_VACIOS } from '../utils/reporteClientesUtils'
import BotonExportarExcel from '../components/ui/BotonExportarExcel'

export default function ReporteClientes() {
  const {
    filtroCiclo,
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

  useEffect(() => { setClienteActivoNombre(null) }, [filtroCiclo.rutaId, filtroCiclo.cicloId])

  const clienteActivo = clientes.find(c => c.nombre === clienteActivoNombre)

  return (
    <div className="max-w-[1400px] mx-auto pb-24">
      <div className="mb-8 pl-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
        <h1 className="text-4xl font-extrabold text-neutro-900 tracking-tight">Faltantes por Cliente</h1>
        <p className="text-neutro-500 mt-2 text-lg">Ajusta entregas, procesa facturas y controla el estado de los pedidos.</p>
        </div>
        <BotonExportarExcel ruta="/reportes/faltantes/cliente/exportar"
          params={{ ...filtroCiclo.params, ...(clienteActivo ? { cliente_nombre: clienteActivo.nombre } : filtros) }}
          disabled={loading || Boolean(error)} title="Descarga los faltantes y las respuestas guardadas de los clientes visibles." />
      </div>

      <FiltroCicloOperacion filtro={filtroCiclo} />
      {loading && <p role="status" className="mb-4 text-neutro-500">Consultando faltantes de la ruta y semana…</p>}

      {error && (
        <div className="bg-peligro-50 border-l-4 border-peligro-500 p-4 mb-8 rounded shadow-sm">
          <div className="flex items-center"><AlertCircle className="text-peligro-500 mr-2" /><p className="text-peligro-700 font-medium">Error: {error}</p></div>
          <button type="button" className="mt-2 min-h-11 font-bold underline" onClick={loadReporte}>Reintentar consulta</button>
        </div>
      )}

      {loading || error ? null : !clienteActivo ? (
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
