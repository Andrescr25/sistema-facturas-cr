import { useState } from 'react'
import { useCuentasPorCobrar } from '../hooks/useCuentasPorCobrar'
import ToastContainer from '../components/ToastContainer'
import ConfirmModal from '../components/ConfirmModal'
import ResumenCards from '../components/cuentas-por-cobrar/ResumenCards'
import FiltrosCuentas from '../components/cuentas-por-cobrar/FiltrosCuentas'
import ListaClientes from '../components/cuentas-por-cobrar/ListaClientes'
import ClienteDetalle from '../components/cuentas-por-cobrar/ClienteDetalle'
import SkeletonClienteCard from '../components/cuentas-por-cobrar/SkeletonClienteCard'

export default function CuentasPorCobrar() {
  const {
    clientes,
    resumen,
    loading,
    error,
    filters,
    setFilters,
    resetFilters,
    sincronizando,
    handleSincronizar,
    handleCargarAbonos,
    registrandoAbono,
    handleRegistrarAbono,
    dialogProps,
    toasts,
    removeToast
  } = useCuentasPorCobrar()

  // NAVEGACIÓN: lista de clientes → detalle de cliente (estado local, mismo
  // patrón que ReporteClientes.jsx)
  const [clienteActivoId, setClienteActivoId] = useState(null)
  const clienteActivo = clientes.find((c) => c.clienteId === clienteActivoId)

  return (
    <div className="max-w-6xl mx-auto pb-24 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <ConfirmModal {...dialogProps} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cuentas por Cobrar</h1>
          <p className="text-gray-600 mt-1">Clientes con facturas pendientes de pago y registro de abonos.</p>
        </div>
      </div>

      {!clienteActivo && (
        <>
          <ResumenCards resumen={resumen} filters={filters} setFilters={setFilters} />
          <FiltrosCuentas
            filters={filters}
            setFilters={setFilters}
            onLimpiar={resetFilters}
            onSincronizar={handleSincronizar}
            sincronizando={sincronizando}
          />
        </>
      )}

      {error && (
        <div className="card bg-red-50 border-red-200 text-red-700">
          <p>{error}</p>
        </div>
      )}

      {loading && clientes.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <SkeletonClienteCard />
          <SkeletonClienteCard />
          <SkeletonClienteCard />
        </div>
      ) : !clienteActivo ? (
        <ListaClientes clientes={clientes} onSelectCliente={setClienteActivoId} />
      ) : (
        <ClienteDetalle
          cliente={clienteActivo}
          onVolver={() => setClienteActivoId(null)}
          onCargarAbonos={handleCargarAbonos}
          registrandoAbono={registrandoAbono}
          onRegistrarAbono={handleRegistrarAbono}
        />
      )}
    </div>
  )
}
