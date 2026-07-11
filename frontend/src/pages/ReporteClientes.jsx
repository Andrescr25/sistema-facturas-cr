import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useReporteClientes } from '../hooks/useReporteClientes'
import ListaClientes from '../components/reporte-clientes/ListaClientes'
import ClienteDetalle from '../components/reporte-clientes/ClienteDetalle'

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
    handleMarcarFacturaPendiente,
    handleQuitarFacturaPendiente,
    handleCantidadEntregadaChange,
    handleMarcarCompleto,
    handleDeshacer,
    handleNoLlegoNada,
    contarAjustes
  } = useReporteClientes()

  // NAVEGACIÓN: lista de clientes → detalle de cliente
  const [clienteActivoNombre, setClienteActivoNombre] = useState(null)

  if (loading && !clientes.length) {
    return (
      <div className="max-w-[1400px] mx-auto text-center py-12">
        <div className="spinner mx-auto mb-4 border-t-2 border-b-2 border-purple-500 rounded-full w-12 h-12 animate-spin"></div>
        <p className="text-gray-600">Cargando reporte de clientes...</p>
      </div>
    )
  }

  const clienteActivo = clientes.find(c => c.nombre === clienteActivoNombre)

  return (
    <div className="max-w-[1400px] mx-auto pb-24">
      <div className="mb-8 pl-1">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Faltantes por Cliente</h1>
        <p className="text-gray-500 mt-2 text-lg">Ajusta entregas, procesa facturas y controla el estado de los pedidos.</p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded shadow-sm">
          <div className="flex items-center"><AlertCircle className="text-red-500 mr-2" /><p className="text-red-700 font-medium">Error: {error}</p></div>
        </div>
      )}

      {!clienteActivo ? (
        <ListaClientes
          clientes={clientes}
          resumen={resumen}
          facturasEstado={facturasEstado}
          contarAjustes={contarAjustes}
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
          onMarcarPendiente={handleMarcarFacturaPendiente}
          onQuitarPendiente={handleQuitarFacturaPendiente}
          onCantidadEntregadaChange={handleCantidadEntregadaChange}
          onMarcarCompleto={handleMarcarCompleto}
          onNoLlegoNada={handleNoLlegoNada}
          onDeshacer={handleDeshacer}
        />
      )}
    </div>
  )
}
