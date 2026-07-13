import { useState } from 'react'
import { usePagosProveedores } from '../hooks/usePagosProveedores'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import ToastContainer from '../components/ToastContainer'
import ResumenCards from '../components/pagos-proveedores/ResumenCards'
import FiltrosPagos from '../components/pagos-proveedores/FiltrosPagos'
import CuentaCard from '../components/pagos-proveedores/CuentaCard'
import SkeletonCuentaCard from '../components/pagos-proveedores/SkeletonCuentaCard'
import ModalDetalleCuenta from '../components/pagos-proveedores/ModalDetalleCuenta'

export default function PagosProveedores() {
  const {
    cuentas,
    resumen,
    loading,
    error,
    filters,
    setFilters,
    resetFilters,
    proveedoresDisponibles,
    actualizarEstado,
    procesandoId,
    reload,
    toasts,
    removeToast
  } = usePagosProveedores()

  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pagos a Proveedores</h1>
          <p className="text-gray-600 mt-1">
            Controla las facturas recibidas, sus fechas de vencimiento y el saldo pendiente a pagar.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn btn-outline flex items-center gap-2"
            onClick={reload}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      <ResumenCards resumen={resumen} filters={filters} setFilters={setFilters} />

      <FiltrosPagos
        filters={filters}
        setFilters={setFilters}
        proveedoresDisponibles={proveedoresDisponibles}
        onLimpiar={resetFilters}
      />

      {error && (
        <div className="card bg-red-50 border-red-200 text-red-700">
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <SkeletonCuentaCard />
          <SkeletonCuentaCard />
          <SkeletonCuentaCard />
        </div>
      ) : cuentas.length === 0 ? (
        !error && (
          <div className="card text-center py-12">
            <CheckCircle2 size={36} className="mx-auto text-green-500 mb-3" />
            <p className="text-gray-700 font-medium">No hay facturas que coincidan con los filtros.</p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {cuentas.map((cuenta) => (
            <CuentaCard
              key={cuenta.id}
              cuenta={cuenta}
              procesando={procesandoId === cuenta.id}
              onVerDetalle={setCuentaSeleccionada}
            />
          ))}
        </div>
      )}

      {cuentaSeleccionada && (
        <ModalDetalleCuenta
          cuenta={cuentaSeleccionada}
          procesando={procesandoId === cuentaSeleccionada.id}
          onRegistrarPago={actualizarEstado}
          onCerrar={() => setCuentaSeleccionada(null)}
        />
      )}
    </div>
  )
}
